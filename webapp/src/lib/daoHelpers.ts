
// src/lib/daoHelpers.ts
import { ethers } from "ethers";
import { getDAOVoting, getBrowserProvider, getForwarder } from "./contracts";
import DAOVotingABI from "./DAOVoting.abi.json"; // para server-side helpers
// Dirección del DAO desde env (usada en server-side helpers)
const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO_CONTRACT_ADDRESS || "";

// ===== Tipos =====

export type Proposal = {
  id: number;
  recipient: string;
  amount: bigint;
  votingDeadline: bigint;
  executionDelay: bigint;
  executed: boolean;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  description: string;
  creator?: string; // Recuperado desde el evento ProposalCreated
};

export enum VoteType {
  ABSTAIN = 0,
  FOR = 1,
  AGAINST = 2,
}

// ===== Helpers comunes (client-side) =====

/** Obtiene la cuenta activa (si la hay) desde Metamask */
export async function getSignerAddress(): Promise<string | null> {
  const provider = getBrowserProvider();
  const accounts: string[] = await provider.send("eth_accounts", []);
  return accounts[0] ?? null;
}

/** Balance ETH del signer (wallet) en wei */
export async function getSignerEthBalanceWei(address: string): Promise<bigint> {
  const provider = getBrowserProvider();
  const bal = await provider.getBalance(address);
  return bal; // bigint
}

/** Balance on-chain del contrato DAO (tesorería) en wei */
export async function getDaoTreasuryBalanceWei(): Promise<bigint> {
  const dao = await getDAOVoting("read");
  const bal: bigint = await dao.getContractBalance();
  return bal;
}

/** Total aportado (tracking contable) en wei */
export async function getDaoTotalDepositedWei(): Promise<bigint> {
  const dao = await getDAOVoting("read");
  const total: bigint = await dao.getTotalDeposited();
  return total;
}

/** Tu contribución registrada en el DAO (tracking) en wei */
export async function getUserContributionWei(address: string): Promise<bigint> {
  const dao = await getDAOVoting("read");
  const bal: bigint = await dao.getUserBalance(address);
  return bal;
}

/** Depósito directo al DAO: fundDAO({ value }) */
export async function depositToDaoDirect(amountWei: bigint): Promise<ethers.TransactionReceipt> {
  const dao = await getDAOVoting("write"); // Retorna el contrato con signer (Metamask)
  const tx = await dao.fundDAO({ value: amountWei });
  const receipt = await tx.wait();
  return receipt;
}

// ===== Utilidades =====

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

export function parseEth(amount: string): bigint {
  return ethers.parseEther(amount);
}

export function truncate(addr?: string, left = 6, right = 4): string {
  if (!addr) return "—";
  return `${addr.slice(0, left)}…${addr.slice(-right)}`;
}

// ===== Lectura de propuestas (client-side) =====

export async function getProposalCount(): Promise<number> {
  const dao = await getDAOVoting("read");
  // nextProposalId es público; en ethers v6 se accede vía .nextProposalId()
  const count: bigint = await dao.nextProposalId();
  return Number(count);
}

export async function getProposalById(id: number): Promise<Proposal | null> {
  const dao = await getDAOVoting("read");
  try {
    const p = await dao.getProposal(id);
    // El struct no incluye `creator`; lo reconstruimos con logs.
    const creator = await getProposalCreatorFromEvent(id);

    const normalized: Proposal = {
      id: Number(p.id),
      recipient: p.recipient,
      amount: BigInt(p.amount),
      votingDeadline: BigInt(p.votingDeadline),
      executionDelay: BigInt(p.executionDelay),
      executed: Boolean(p.executed),
      forVotes: BigInt(p.forVotes),
      againstVotes: BigInt(p.againstVotes),
      abstainVotes: BigInt(p.abstainVotes),
      description: p.description,
      creator,
    };
    return normalized;
  } catch {
    return null;
  }
}

export async function listProposals(): Promise<Proposal[]> {
  const count = await getProposalCount();
  const results: Proposal[] = [];
  for (let i = 1; i <= count; i++) {
    const p = await getProposalById(i);
    if (p) results.push(p);
  }
  return results;
}

/** Recupera el `creator` del evento ProposalCreated(proposalId, creator, ...) */

export async function getProposalCreatorFromEvent(proposalId: number): Promise<string | undefined> {
  const dao = await getDAOVoting("read");
  const provider = getBrowserProvider();

  // Usa bloque de despliegue si lo conoces para optimizar (opcional)
  const fromBlockEnv = process.env.NEXT_PUBLIC_DAO_DEPLOY_BLOCK;
  const fromBlock = fromBlockEnv ? Number(fromBlockEnv) : 0;
  const toBlock = await provider.getBlockNumber();

  // Filtro del contrato: filtra por proposalId (indexed)
  const filter = dao.filters.ProposalCreated(proposalId);
  const logs = await dao.queryFilter(filter, fromBlock, toBlock);

  if (!logs || logs.length === 0) return undefined;

  // Toma el último evento (por si hubo recreaciones en tests)
  const last = logs[logs.length - 1];
  const creator = last.args?.creator as string | undefined;
  return creator;
}


// ===== Estado derivado para UI =====

export function getNowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

export function getTimeRemainingSec(p: Proposal): number {
  const now = getNowSeconds();
  const diff = p.votingDeadline - now;
  return Number(diff > 0n ? diff : 0n);
}

export function isActive(p: Proposal): boolean {
  const now = getNowSeconds();
  return !p.executed && now < p.votingDeadline;
}

export function getTotalVotes(p: Proposal): number {
  return Number(p.forVotes + p.againstVotes + p.abstainVotes);
}

export function getVotePercentages(p: Proposal): { for: number; against: number; abstain: number } {
  const total = getTotalVotes(p);
  if (total === 0) return { for: 0, against: 0, abstain: 0 };
  const forPct = (Number(p.forVotes) * 100) / total;
  const againstPct = (Number(p.againstVotes) * 100) / total;
  const abstainPct = (Number(p.abstainVotes) * 100) / total;
  return {
    for: Math.round(forPct * 10) / 10,
    against: Math.round(againstPct * 10) / 10,
    abstain: Math.round(abstainPct * 10) / 10,
  };
}

// ===== Crear propuesta (directa, client-side) =====

export async function createProposalDirect(
  recipient: string,
  amountWei: bigint,
  votingDurationSec: number,
  description: string
): Promise<ethers.TransactionReceipt> {
  const dao = await getDAOVoting("write");
  const tx = await dao.createProposal(recipient, amountWei, BigInt(votingDurationSec), description);
  const receipt = await tx.wait();
  return receipt;
}

// ===== Crear propuesta (gasless, client-side: EIP‑712 + relayer) =====

export async function buildCreateProposalMetaTx(
  from: string,
  recipient: string,
  amountWei: bigint,
  votingDurationSec: number,
  description: string
): Promise<{ request: any; signature: string }> {
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const { chainId } = await provider.getNetwork();

  const daoRead = await getDAOVoting("read");
  const forwarder = await getForwarder("read");

  // calldata de createProposal(recipient, amount, votingDuration, description)
  const data = daoRead.interface.encodeFunctionData("createProposal", [
    recipient,
    amountWei,
    BigInt(votingDurationSec),
    description,
  ]);

  // nonce en el forwarder
  const nonce: bigint = await forwarder.getNonce(from);

  // Estimar gas (orientativo) para la llamada interna
  let gas: bigint = 300_000n;
  try {
    const daoWrite = await getDAOVoting("write");
    const est = await daoWrite.estimateGas.createProposal(recipient, amountWei, BigInt(votingDurationSec), description);
    gas = (est * 120n) / 100n; // margen +20%
  } catch {
    // fallback
  }

  const request = {
    from,
    to: daoRead.target as string,
    value: 0n,             // createProposal NO envía ETH
    gas,
    nonce,
    data,
  };

  const domain = {
    name: "MinimalForwarder",
    version: "0.0.1",
    chainId: Number(chainId),
    verifyingContract: (forwarder.target as string),
  };

  const types = {
    ForwardRequest: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "gas", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
  };

  const signature = await (signer as any).signTypedData(domain, types, request);
  return { request, signature };
}

/** Envía el ForwardRequest al relayer API */
export async function sendMetaTxToRelayer(request: any, signature: string): Promise<{ txHash: string }> {
  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request, signature }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || data?.message || `Relayer error: ${res.status}`);
  }
  const data = await res.json();
  return { txHash: data.txHash };
}

// ===== Votos (directo, client-side) =====

export async function voteDirect(proposalId: number, vote: VoteType): Promise<ethers.TransactionReceipt> {
  const dao = await getDAOVoting("write");
  const tx = await dao.vote(proposalId, vote);
  return tx.wait();
}

// ===== Daemon helpers (server-side) =====
// ATENCIÓN: En servidor NO usar getDAOVoting/getBrowserProvider (window.ethereum no existe).
// Usamos Provider/Signer que reciba el caller.

export async function canExecuteProposal(provider: ethers.Provider, proposalId: number): Promise<boolean> {
  if (!DAO_ADDRESS) throw new Error("DAO_ADDRESS not configured");
  const dao = new ethers.Contract(DAO_ADDRESS, DAOVotingABI, provider);
  const p = await dao.getProposal(proposalId);
  if (!p || p.id === 0n) return false;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const passedVoting = now >= BigInt(p.votingDeadline);
  const passedDelay = now >= BigInt(p.executionDelay);
  const approved = BigInt(p.forVotes) > BigInt(p.againstVotes);
  const notExecuted = !Boolean(p.executed);
  const contractBal: bigint = await dao.getContractBalance();
  const enoughBalance = BigInt(p.amount) <= contractBal;
  return passedVoting && passedDelay && approved && notExecuted && enoughBalance;
}

export async function executeProposalDirect(signer: ethers.Signer, proposalId: number): Promise<ethers.TransactionReceipt> {
  if (!DAO_ADDRESS) throw new Error("DAO_ADDRESS not configured");
  const dao = new ethers.Contract(DAO_ADDRESS, DAOVotingABI, signer);
  const tx = await dao.executeProposal(proposalId);
  return tx.wait();
}


// src/lib/daoHelpers.ts (añade)
export async function preValidateCreateProposal(from: string, amountWei: bigint): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];
  const dao = await getDAOVoting("read");

  const treasury: bigint = await dao.getContractBalance();
  if (amountWei > treasury) {
    issues.push("La tesorería del DAO no tiene fondos suficientes para el monto indicado.");
  }

  const totalDeposited: bigint = await dao.getTotalDeposited();
  if (totalDeposited === 0n) {
    issues.push("La tesorería contable del DAO está vacía. Debes aportar antes de crear propuestas.");
  } else {
    const required: bigint = (totalDeposited * 10n) / 100n;
    const myContribution: bigint = await dao.getUserBalance(from);
    if (myContribution < required) {
      issues.push(`Necesitas aportar al menos el 10% del total del DAO (${ethers.formatEther(required)} ETH) para crear propuestas.`);
    }
  }

  return { ok: issues.length === 0, issues };
}

