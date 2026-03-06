use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

declare_id!("PHTtoken1111111111111111111111111111111111");

/// VRT (Verity Token) — 체인의 거버넌스 & 유틸리티 토큰
///
/// 용도:
/// 1. 사진 등록 수수료 지불
/// 2. 거버넌스 투표
/// 3. 밸리데이터 스테이킹 보상
/// 4. 포토 등록 시 보상 (Photo-to-Earn)
#[program]
pub mod verity_token {
    use super::*;

    /// VRT 토큰 민트 초기화 (체인 시작 시 1회)
    pub fn initialize_mint(ctx: Context<InitializeMint>) -> Result<()> {
        let config = &mut ctx.accounts.token_config;
        config.authority = ctx.accounts.authority.key();
        config.mint = ctx.accounts.pht_mint.key();
        config.total_minted = 0;
        config.max_supply = 1_000_000_000 * 10u64.pow(9); // 1B VRT
        config.photo_reward_amount = 100 * 10u64.pow(9);   // 사진 1장당 100 VRT
        config.photo_reward_enabled = true;
        config.bump = ctx.bumps.token_config;

        msg!("VRT Token initialized. Max supply: 1,000,000,000 VRT");
        Ok(())
    }

    /// 사진 등록 보상으로 VRT 지급 (Photo-to-Earn)
    pub fn reward_photo_registration(
        ctx: Context<RewardPhotoRegistration>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.token_config;

        require!(config.photo_reward_enabled, PhtError::RewardsDisabled);

        let reward = config.photo_reward_amount;
        let new_total = config.total_minted.checked_add(reward)
            .ok_or(PhtError::Overflow)?;

        require!(new_total <= config.max_supply, PhtError::MaxSupplyReached);

        let authority_key = config.authority;
        let seeds = &[
            b"pht_config".as_ref(),
            authority_key.as_ref(),
            &[config.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.pht_mint.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.token_config.to_account_info(),
                },
                signer_seeds,
            ),
            reward,
        )?;

        config.total_minted = new_total;

        emit!(PhotoRewardIssued {
            recipient: ctx.accounts.recipient.key(),
            amount: reward,
            total_minted: new_total,
        });

        Ok(())
    }

    /// 보상 파라미터 업데이트 (거버넌스)
    pub fn update_reward_config(
        ctx: Context<UpdateRewardConfig>,
        new_reward_amount: Option<u64>,
        enabled: Option<bool>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.token_config;

        if let Some(amount) = new_reward_amount {
            require!(amount <= 10_000 * 10u64.pow(9), PhtError::RewardTooHigh);
            config.photo_reward_amount = amount;
        }

        if let Some(flag) = enabled {
            config.photo_reward_enabled = flag;
        }

        emit!(RewardConfigUpdated {
            reward_amount: config.photo_reward_amount,
            enabled: config.photo_reward_enabled,
        });

        Ok(())
    }
}

// ─── Accounts ───

#[derive(Accounts)]
pub struct InitializeMint<'info> {
    #[account(
        init,
        payer = authority,
        space = TokenConfig::SPACE,
        seeds = [b"pht_config", authority.key().as_ref()],
        bump,
    )]
    pub token_config: Account<'info, TokenConfig>,

    #[account(mut)]
    pub pht_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RewardPhotoRegistration<'info> {
    #[account(
        mut,
        seeds = [b"pht_config", token_config.authority.as_ref()],
        bump = token_config.bump,
    )]
    pub token_config: Account<'info, TokenConfig>,

    #[account(
        mut,
        constraint = pht_mint.key() == token_config.mint @ PhtError::InvalidMint
    )]
    pub pht_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = recipient_token_account.mint == pht_mint.key() @ PhtError::InvalidMint
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    /// CHECK: 보상 수령인 (서명 필요 없음)
    pub recipient: UncheckedAccount<'info>,

    /// 등록을 트리거한 권한자 (체인 프로그램 or authority)
    pub caller_authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateRewardConfig<'info> {
    #[account(
        mut,
        seeds = [b"pht_config", token_config.authority.as_ref()],
        bump = token_config.bump,
        has_one = authority @ PhtError::Unauthorized,
    )]
    pub token_config: Account<'info, TokenConfig>,

    pub authority: Signer<'info>,
}

// ─── State ───

#[account]
pub struct TokenConfig {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub total_minted: u64,
    pub max_supply: u64,
    pub photo_reward_amount: u64,
    pub photo_reward_enabled: bool,
    pub bump: u8,
}

impl TokenConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

// ─── Events ───

#[event]
pub struct PhotoRewardIssued {
    pub recipient: Pubkey,
    pub amount: u64,
    pub total_minted: u64,
}

#[event]
pub struct RewardConfigUpdated {
    pub reward_amount: u64,
    pub enabled: bool,
}

// ─── Errors ───

#[error_code]
pub enum PhtError {
    #[msg("Photo registration rewards are currently disabled")]
    RewardsDisabled,
    #[msg("Maximum token supply has been reached")]
    MaxSupplyReached,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Reward amount exceeds maximum allowed")]
    RewardTooHigh,
    #[msg("Invalid mint account")]
    InvalidMint,
    #[msg("Unauthorized")]
    Unauthorized,
}
