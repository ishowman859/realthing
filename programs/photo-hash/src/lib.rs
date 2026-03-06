use anchor_lang::prelude::*;

declare_id!("PHotohash111111111111111111111111111111111");

#[program]
pub mod photo_hash {
    use super::*;

    /// 사진의 pHash를 온체인에 등록
    pub fn register_photo(
        ctx: Context<RegisterPhoto>,
        phash: String,
        image_uri: String,
    ) -> Result<()> {
        require!(phash.len() <= 128, VerityHashError::PhashTooLong);
        require!(image_uri.len() <= 256, VerityHashError::UriTooLong);

        let photo_record = &mut ctx.accounts.photo_record;
        let clock = Clock::get()?;

        photo_record.owner = ctx.accounts.owner.key();
        photo_record.phash = phash.clone();
        photo_record.image_uri = image_uri;
        photo_record.timestamp = clock.unix_timestamp;
        photo_record.bump = ctx.bumps.photo_record;

        emit!(PhotoRegistered {
            owner: ctx.accounts.owner.key(),
            phash,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// 기존에 등록된 pHash 기록에 대해 검증 요청 (조회용 이벤트 발생)
    pub fn verify_photo(
        ctx: Context<VerifyPhoto>,
        phash: String,
    ) -> Result<()> {
        let photo_record = &ctx.accounts.photo_record;

        let is_match = photo_record.phash == phash;

        emit!(PhotoVerified {
            owner: photo_record.owner,
            stored_phash: photo_record.phash.clone(),
            query_phash: phash,
            is_match,
            registered_at: photo_record.timestamp,
        });

        Ok(())
    }
}

// ─── Accounts ───

#[derive(Accounts)]
#[instruction(phash: String, image_uri: String)]
pub struct RegisterPhoto<'info> {
    #[account(
        init,
        payer = owner,
        space = PhotoRecord::space(&phash, &image_uri),
        seeds = [b"photo", owner.key().as_ref(), phash.as_bytes()],
        bump,
    )]
    pub photo_record: Account<'info, PhotoRecord>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyPhoto<'info> {
    pub photo_record: Account<'info, PhotoRecord>,
}

// ─── State ───

#[account]
pub struct PhotoRecord {
    /// 사진 소유자 지갑 주소
    pub owner: Pubkey,
    /// 사진의 Perceptual Hash 값
    pub phash: String,
    /// 이미지 URI (IPFS/Arweave 등, 선택)
    pub image_uri: String,
    /// 등록 시각 (Unix timestamp)
    pub timestamp: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl PhotoRecord {
    pub fn space(phash: &str, image_uri: &str) -> usize {
        8 +                          // discriminator
        32 +                         // owner (Pubkey)
        4 + phash.len() +            // phash (String: 4 bytes len prefix + data)
        4 + image_uri.len() +        // image_uri (String)
        8 +                          // timestamp (i64)
        1                            // bump (u8)
    }
}

// ─── Events ───

#[event]
pub struct PhotoRegistered {
    pub owner: Pubkey,
    pub phash: String,
    pub timestamp: i64,
}

#[event]
pub struct PhotoVerified {
    pub owner: Pubkey,
    pub stored_phash: String,
    pub query_phash: String,
    pub is_match: bool,
    pub registered_at: i64,
}

// ─── Errors ───

#[error_code]
pub enum VerityHashError {
    #[msg("pHash value exceeds maximum length of 128 characters")]
    PhashTooLong,
    #[msg("Image URI exceeds maximum length of 256 characters")]
    UriTooLong,
}
