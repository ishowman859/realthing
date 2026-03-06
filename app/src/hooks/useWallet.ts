import { useState, useCallback } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { getBalance, CHAIN_CONFIG } from "../utils/solana";

export interface WalletState {
  publicKey: PublicKey | null;
  address: string | null;
  balance: number;
  connected: boolean;
  connecting: boolean;
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    publicKey: null,
    address: null,
    balance: 0,
    connected: false,
    connecting: false,
  });

  const connect = useCallback(async () => {
    setWallet((prev) => ({ ...prev, connecting: true }));

    try {
      const result = await transact(async (mobileWallet) => {
        const authResult = await mobileWallet.authorize({
          identity: {
            name: "Verity",
            uri: "https://verity.app",
            icon: "favicon.ico",
          },
          cluster: "devnet",
          chain: CHAIN_CONFIG.name,
        });

        return {
          publicKey: new PublicKey(authResult.accounts[0].address),
          authToken: authResult.auth_token,
        };
      });

      const balance = await getBalance(result.publicKey);

      setWallet({
        publicKey: result.publicKey,
        address: result.publicKey.toBase58(),
        balance,
        connected: true,
        connecting: false,
      });

      return result.publicKey;
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setWallet((prev) => ({ ...prev, connecting: false }));
      throw error;
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet({
      publicKey: null,
      address: null,
      balance: 0,
      connected: false,
      connecting: false,
    });
  }, []);

  const signAndSendTransaction = useCallback(
    async (transaction: Transaction): Promise<string> => {
      if (!wallet.publicKey) {
        throw new Error("Wallet not connected");
      }

      const result = await transact(async (mobileWallet) => {
        const authResult = await mobileWallet.authorize({
          identity: {
            name: "Verity",
            uri: "https://verity.app",
          },
          cluster: "devnet",
        });

        const signedTxs = await mobileWallet.signAndSendTransactions({
          transactions: [
            transaction
              .serialize({ requireAllSignatures: false })
              .toString("base64"),
          ],
        });

        return signedTxs[0];
      });

      return result;
    },
    [wallet.publicKey]
  );

  const refreshBalance = useCallback(async () => {
    if (wallet.publicKey) {
      const balance = await getBalance(wallet.publicKey);
      setWallet((prev) => ({ ...prev, balance }));
    }
  }, [wallet.publicKey]);

  return {
    ...wallet,
    connect,
    disconnect,
    signAndSendTransaction,
    refreshBalance,
  };
}
