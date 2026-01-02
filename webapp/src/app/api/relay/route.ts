
// app/api/relay/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || "";
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const FORWARDER_ADDRESS = process.env.NEXT_PUBLIC_FORWARDER_CONTRACT_ADDRESS || "";

const FORWARDER_ABI = [
  "function execute((address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data) req, bytes signature) payable returns (bool, bytes)",
  "function getNonce(address from) view returns (uint256)"
];

// POST /api/relay
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { request, signature } = body;
    if (!request || !signature) {
      return NextResponse.json({ error: "Missing request or signature" }, { status: 400 });
    }
    if (!RELAYER_PRIVATE_KEY) {
      return NextResponse.json({ error: "Relayer not configured: RELAYER_PRIVATE_KEY missing" }, { status: 500 });
    }
    if (!FORWARDER_ADDRESS) {
      return NextResponse.json({ error: "Forwarder address not configured" }, { status: 500 });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const relayer = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
    const forwarder = new ethers.Contract(FORWARDER_ADDRESS, FORWARDER_ABI, relayer);

    // Verificación de nonce
    const currentNonce: bigint = await forwarder.getNonce(request.from);
    const requestedNonce = BigInt(request.nonce);
    if (requestedNonce !== currentNonce) {
      return NextResponse.json(
        { error: "Nonce mismatch", expected: currentNonce.toString(), received: request.nonce },
        { status: 400 }
      );
    }

    // Opcional: estimar gas (si falla, seguimos)
    try {
      const gasEstimate: bigint = await forwarder.execute.estimateGas(request, signature);
      console.log("Relay gas estimate:", gasEstimate.toString());
    } catch (e) {
      console.warn("Relay estimateGas failed:", e);
    }

    // Ejecutar meta‑tx (para createProposal, request.value = 0)
    const tx = await forwarder.execute(request, signature, { gasLimit: 3_000_000 });
    const receipt = await tx.wait();

    return NextResponse.json({ success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber });
  } catch (error: any) {
    console.error("[relay] error:", error);
    return NextResponse.json(
      { error: "Failed to relay transaction", message: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
