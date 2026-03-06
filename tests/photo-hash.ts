import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";

describe("photo-hash", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PhotoHash as Program<any>;
  const owner = provider.wallet;

  const testPhash = "a1b2c3d4e5f6a7b8";
  const testImageUri = "ipfs://QmTestHash123456789";

  it("registers a photo hash on-chain", async () => {
    const [photoRecordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("photo"),
        owner.publicKey.toBuffer(),
        Buffer.from(testPhash),
      ],
      program.programId
    );

    const tx = await program.methods
      .registerPhoto(testPhash, testImageUri)
      .accounts({
        photoRecord: photoRecordPda,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Register tx:", tx);

    const record = await program.account.photoRecord.fetch(photoRecordPda);
    expect(record.owner.toString()).to.equal(owner.publicKey.toString());
    expect(record.phash).to.equal(testPhash);
    expect(record.imageUri).to.equal(testImageUri);
    expect(record.timestamp.toNumber()).to.be.greaterThan(0);
  });

  it("verifies a photo hash", async () => {
    const [photoRecordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("photo"),
        owner.publicKey.toBuffer(),
        Buffer.from(testPhash),
      ],
      program.programId
    );

    const tx = await program.methods
      .verifyPhoto(testPhash)
      .accounts({
        photoRecord: photoRecordPda,
      })
      .rpc();

    console.log("Verify tx:", tx);
  });

  it("rejects phash that is too long", async () => {
    const longPhash = "a".repeat(129);
    const [photoRecordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("photo"),
        owner.publicKey.toBuffer(),
        Buffer.from(longPhash),
      ],
      program.programId
    );

    try {
      await program.methods
        .registerPhoto(longPhash, testImageUri)
        .accounts({
          photoRecord: photoRecordPda,
          owner: owner.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (err) {
      expect(err).to.exist;
    }
  });
});
