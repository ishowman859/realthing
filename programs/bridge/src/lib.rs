use anchor_lang::prelude::*;

declare_id!("BRDGpht111111111111111111111111111111111111");

/// SOL <-> VRT 브릿지 프로그램
///
/// Lock-and-Mint / Burn-and-Release 방식:
/// - Solana → VRT Chain: SOL을 lock → VRT Chain에서 Wrapped SOL 민팅
/// - VRT Chain → Solana: Wrapped SOL 번 → Solana에서 SOL unlock
///
/// 릴레이어(off-chain)가 양쪽 체인의 이벤트를 감시하고 실행합니다.
#[program]
pub mod pht_bridge {
    use super::*;

    /// 브릿지 초기화 (관리자 설정, vault 생성)
    pub fn initialize(
        ctx: Context<Initialize>,
        relayer: Pubkey,
    ) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge_config;
        bridge.authority = ctx.accounts.authority.key();
        bridge.relayer = relayer;
        bridge.vault = ctx.accounts.vault.key();
        bridge.total_locked = 0;
        bridge.total_bridged = 0;
        bridge.nonce = 0;
        bridge.paused = false;
        bridge.bump = ctx.bumps.bridge_config;
        bridge.vault_bump = ctx.bumps.vault;

        msg!("VRT Bridge initialized");
        Ok(())
    }

    /// Solana → VRT Chain: SOL을 Vault에 잠금 (lock)
    /// 릴레이어가 이 이벤트를 감지하여 VRT Chain에서 Wrapped SOL 민팅
    pub fn lock_sol(
        ctx: Context<LockSol>,
        amount: u64,
        destination_address: String,
    ) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge_config;

        require!(!bridge.paused, BridgeError::BridgePaused);
        require!(amount >= 10_000_000, BridgeError::AmountTooSmall); // min 0.01 SOL
        require!(destination_address.len() <= 64, BridgeError::InvalidAddress);

        // SOL 전송 (사용자 → vault)
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.sender.key(),
            &ctx.accounts.vault.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.sender.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        bridge.total_locked = bridge.total_locked.checked_add(amount)
            .ok_or(BridgeError::Overflow)?;
        bridge.nonce = bridge.nonce.checked_add(1)
            .ok_or(BridgeError::Overflow)?;

        // 잠금 기록 생성
        let lock_record = &mut ctx.accounts.lock_record;
        lock_record.sender = ctx.accounts.sender.key();
        lock_record.destination = destination_address.clone();
        lock_record.amount = amount;
        lock_record.nonce = bridge.nonce;
        lock_record.timestamp = Clock::get()?.unix_timestamp;
        lock_record.completed = false;
        lock_record.bump = ctx.bumps.lock_record;

        emit!(SolLocked {
            sender: ctx.accounts.sender.key(),
            destination: destination_address,
            amount,
            nonce: bridge.nonce,
            timestamp: lock_record.timestamp,
        });

        Ok(())
    }

    /// VRT Chain → Solana: 릴레이어가 SOL을 Vault에서 릴리즈 (unlock)
    /// VRT Chain에서 Wrapped SOL 번 이벤트 확인 후 실행
    pub fn release_sol(
        ctx: Context<ReleaseSol>,
        amount: u64,
        source_nonce: u64,
        source_chain_tx: String,
    ) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge_config;

        require!(!bridge.paused, BridgeError::BridgePaused);

        // Vault에서 수신자에게 SOL 전송
        let authority_key = bridge.authority;
        let seeds = &[
            b"vault".as_ref(),
            authority_key.as_ref(),
            &[bridge.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.recipient.to_account_info().try_borrow_mut_lamports()? += amount;

        bridge.total_bridged = bridge.total_bridged.checked_add(amount)
            .ok_or(BridgeError::Overflow)?;

        emit!(SolReleased {
            recipient: ctx.accounts.recipient.key(),
            amount,
            source_nonce,
            source_chain_tx,
        });

        Ok(())
    }

    /// 브릿지 일시정지/재개
    pub fn set_paused(ctx: Context<AdminAction>, paused: bool) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge_config;
        bridge.paused = paused;

        msg!("Bridge paused: {}", paused);
        Ok(())
    }

    /// 릴레이어 변경
    pub fn update_relayer(
        ctx: Context<AdminAction>,
        new_relayer: Pubkey,
    ) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge_config;
        bridge.relayer = new_relayer;

        msg!("Relayer updated: {}", new_relayer);
        Ok(())
    }
}

// ─── Accounts ───

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = BridgeConfig::SPACE,
        seeds = [b"bridge", authority.key().as_ref()],
        bump,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    /// CHECK: PDA vault for locked SOL
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockSol<'info> {
    #[account(
        mut,
        seeds = [b"bridge", bridge_config.authority.as_ref()],
        bump = bridge_config.bump,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    #[account(
        init,
        payer = sender,
        space = LockRecord::SPACE,
        seeds = [
            b"lock",
            sender.key().as_ref(),
            &(bridge_config.nonce + 1).to_le_bytes(),
        ],
        bump,
    )]
    pub lock_record: Account<'info, LockRecord>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [b"vault", bridge_config.authority.as_ref()],
        bump = bridge_config.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub sender: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseSol<'info> {
    #[account(
        mut,
        seeds = [b"bridge", bridge_config.authority.as_ref()],
        bump = bridge_config.bump,
        has_one = relayer @ BridgeError::UnauthorizedRelayer,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [b"vault", bridge_config.authority.as_ref()],
        bump = bridge_config.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: SOL 수령인
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    pub relayer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(
        mut,
        seeds = [b"bridge", bridge_config.authority.as_ref()],
        bump = bridge_config.bump,
        has_one = authority @ BridgeError::Unauthorized,
    )]
    pub bridge_config: Account<'info, BridgeConfig>,

    pub authority: Signer<'info>,
}

// ─── State ───

#[account]
pub struct BridgeConfig {
    pub authority: Pubkey,
    pub relayer: Pubkey,
    pub vault: Pubkey,
    pub total_locked: u64,
    pub total_bridged: u64,
    pub nonce: u64,
    pub paused: bool,
    pub bump: u8,
    pub vault_bump: u8,
}

impl BridgeConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1;
}

#[account]
pub struct LockRecord {
    pub sender: Pubkey,
    pub destination: String,
    pub amount: u64,
    pub nonce: u64,
    pub timestamp: i64,
    pub completed: bool,
    pub bump: u8,
}

impl LockRecord {
    pub const SPACE: usize = 8 + 32 + (4 + 64) + 8 + 8 + 8 + 1 + 1;
}

// ─── Events ───

#[event]
pub struct SolLocked {
    pub sender: Pubkey,
    pub destination: String,
    pub amount: u64,
    pub nonce: u64,
    pub timestamp: i64,
}

#[event]
pub struct SolReleased {
    pub recipient: Pubkey,
    pub amount: u64,
    pub source_nonce: u64,
    pub source_chain_tx: String,
}

// ─── Errors ───

#[error_code]
pub enum BridgeError {
    #[msg("Bridge is currently paused")]
    BridgePaused,
    #[msg("Amount is below minimum bridge threshold (0.01 SOL)")]
    AmountTooSmall,
    #[msg("Invalid destination address")]
    InvalidAddress,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Unauthorized relayer")]
    UnauthorizedRelayer,
    #[msg("Unauthorized")]
    Unauthorized,
}
