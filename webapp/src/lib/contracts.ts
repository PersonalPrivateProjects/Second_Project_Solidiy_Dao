
// src/lib/contracts.ts
import { ethers } from "ethers";
import DAOVotingABI from "./DAOVoting.abi.json";
import MinimalForwarderABI from "./MinimalForwarder.abi.json";
import { getEthereum } from "./web3";

const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO_CONTRACT_ADDRESS;
const FORWARDER_ADDRESS = process.env.NEXT_PUBLIC_FORWARDER_CONTRACT_ADDRESS;

function ensureAddresses() {
  if (!DAO_ADDRESS) throw new Error("Falta NEXT_PUBLIC_DAO_ADDRESS en variables de entorno.");
  if (!FORWARDER_ADDRESS) throw new Error("Falta NEXT_PUBLIC_FORWARDER_ADDRESS en variables de entorno.");
}

export function getBrowserProvider(): ethers.BrowserProvider {
  const eth = getEthereum();
  if (!eth) throw new Error("No se encontró un provider Ethereum (Metamask).");
  return new ethers.BrowserProvider(eth);
}

export async function getSigner(): Promise<ethers.Signer> {
  const provider = getBrowserProvider();
  return provider.getSigner();
}

export async function getDAOVoting(readWrite: "read" | "write" = "read") {
  ensureAddresses();
  if (readWrite === "write") {
    const signer = await getSigner();
    return new ethers.Contract(DAO_ADDRESS!, DAOVotingABI, signer);
  }
  const provider = getBrowserProvider();
  return new ethers.Contract(DAO_ADDRESS!, DAOVotingABI, provider);
}

export async function getForwarder(readWrite: "read" | "write" = "read") {
  ensureAddresses();
  if (readWrite === "write") {
    const signer = await getSigner();
    return new ethers.Contract(FORWARDER_ADDRESS!, MinimalForwarderABI, signer);
  }
  const provider = getBrowserProvider();
  return new ethers.Contract(FORWARDER_ADDRESS!, MinimalForwarderABI, provider);
}

/** Helper: obtiene la cuenta activa (si la hay) desde Metamask */
export async function getActiveAccount(): Promise<string | null> {
  const provider = getBrowserProvider();
  const accounts: string[] = await provider.send("eth_accounts", []);
  return accounts[0] ?? null;
}

/** Helper: formatea wei → string ETH con 4 decimales */
export function formatEth(wei: bigint | string | number): string {
  try {
    const asWei = typeof wei === "bigint" ? wei : BigInt(wei);
    const eth = Number(ethers.formatEther(asWei));
    return eth.toFixed(4);
  } catch {
    const eth = Number(wei);
    return isNaN(eth) ? "0.0000" : eth.toFixed(4);
  }
}

/** Helper: parsea string decimal → wei (bigint) o lanza error */
export function parseEth(amount: string): bigint {
  return ethers.parseEther(amount);
}
