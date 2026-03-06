import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";

import idl from "../idl/photo_hash.json";

export const PROGRAM_ID = new PublicKey(
  "PHotohash111111111111111111111111111111111"
);

export const VRT_TOKEN_PROGRAM_ID = new PublicKey(
  "PHTtoken1111111111111111111111111111111111"
);

export const BRIDGE_PROGRAM_ID = new PublicKey(
  "BRDGpht111111111111111111111111111111111111"
);

/**
 * Verity Chain RPC 엔드포인트
 * - production: https://rpc.verity.io
 * - local dev:  http://localhost:8899
 */
export const CHAIN_CONFIG = {
  name: "Verity Chain",
  ticker: "VRT",
  rpcUrl: __DEV__
    ? "http://localhost:8899"
    : "https://rpc.verity.io",
  wsUrl: __DEV__
    ? "ws://localhost:8900"
    : "wss://rpc.verity.io/ws",
  explorerUrl: __DEV__
    ? "http://localhost:3000"
    : "https://explorer.verity.io",
};

declare const __DEV__: boolean;

export function getConnection(): Connection {
  return new Connection(CHAIN_CONFIG.rpcUrl, {
    commitment: "confirmed",
    wsEndpoint: CHAIN_CONFIG.wsUrl,
  });
}

/**
 * PhotoRecord PDA 주소를 계산합니다.
 */
export function getPhotoRecordPDA(
  owner: PublicKey,
  phash: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("photo"), owner.toBuffer(), Buffer.from(phash)],
    PROGRAM_ID
  );
}

/**
 * registerPhoto 인스트럭션에 필요한 데이터를 Anchor 형식으로 직렬화합니다.
 *
 * Anchor instruction discriminator = sha256("global:register_photo")[0..8]
 * Args: phash (string), image_uri (string)
 *   - string = 4 bytes (little-endian length) + utf8 bytes
 */
export function createRegisterPhotoInstruction(
  owner: PublicKey,
  phash: string,
  imageUri: string
): TransactionInstruction {
  const [photoRecordPda] = getPhotoRecordPDA(owner, phash);

  const discriminator = Buffer.from([
    215, 168, 53, 163, 62, 87, 80, 36,
  ]);

  const phashBytes = Buffer.from(phash, "utf-8");
  const phashLen = Buffer.alloc(4);
  phashLen.writeUInt32LE(phashBytes.length, 0);

  const uriBytes = Buffer.from(imageUri, "utf-8");
  const uriLen = Buffer.alloc(4);
  uriLen.writeUInt32LE(uriBytes.length, 0);

  const data = Buffer.concat([
    discriminator,
    phashLen,
    phashBytes,
    uriLen,
    uriBytes,
  ]);

  const keys = [
    { pubkey: photoRecordPda, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: true, isWritable: true },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: PROGRAM_ID,
    data,
  });
}

/**
 * pHash 등록 트랜잭션을 생성합니다.
 * 지갑에서 서명 후 전송해야 합니다.
 */
export async function buildRegisterTransaction(
  owner: PublicKey,
  phash: string,
  imageUri: string = ""
): Promise<Transaction> {
  const connection = getConnection();

  const instruction = createRegisterPhotoInstruction(
    owner,
    phash,
    imageUri
  );

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = owner;

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;

  return transaction;
}

/**
 * 특정 소유자의 모든 PhotoRecord 계정을 조회합니다.
 */
export async function fetchPhotoRecords(
  owner: PublicKey
): Promise<PhotoRecordData[]> {
  const connection = getConnection();

  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { dataSize: 200 }, // 대략적인 계정 크기 필터 (정확하지 않을 수 있음)
      {
        memcmp: {
          offset: 8, // discriminator 이후
          bytes: owner.toBase58(),
        },
      },
    ],
  });

  return accounts.map((account) => {
    const data = account.account.data;
    return deserializePhotoRecord(data, account.pubkey);
  });
}

export interface PhotoRecordData {
  address: string;
  owner: string;
  phash: string;
  imageUri: string;
  timestamp: number;
}

/**
 * 온체인 PhotoRecord 바이너리 데이터를 역직렬화합니다.
 */
function deserializePhotoRecord(
  data: Buffer,
  address: PublicKey
): PhotoRecordData {
  let offset = 8; // skip discriminator

  const ownerBytes = data.subarray(offset, offset + 32);
  const owner = new PublicKey(ownerBytes).toBase58();
  offset += 32;

  const phashLen = data.readUInt32LE(offset);
  offset += 4;
  const phash = data.subarray(offset, offset + phashLen).toString("utf-8");
  offset += phashLen;

  const uriLen = data.readUInt32LE(offset);
  offset += 4;
  const imageUri = data.subarray(offset, offset + uriLen).toString("utf-8");
  offset += uriLen;

  const timestampBigInt = data.readBigInt64LE(offset);
  const timestamp = Number(timestampBigInt);

  return {
    address: address.toBase58(),
    owner,
    phash,
    imageUri,
    timestamp,
  };
}

/**
 * VRT 잔액을 조회합니다 (네이티브 토큰).
 */
export async function getBalance(publicKey: PublicKey): Promise<number> {
  const connection = getConnection();
  const balance = await connection.getBalance(publicKey);
  return balance / 1e9; // lamports → VRT
}

/**
 * 트랜잭션을 전송하고 확인합니다.
 */
export async function sendAndConfirmTransaction(
  signedTransaction: Transaction
): Promise<string> {
  const connection = getConnection();
  const rawTransaction = signedTransaction.serialize();
  const signature = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}
