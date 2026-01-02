
// src/lib/web3.ts
import { BrowserProvider, JsonRpcSigner, formatEther } from "ethers";

export const LOCAL_CHAIN_ID_DEC = 31337;
export const LOCAL_CHAIN_ID_HEX = "0x7a69"; // 31337 en hex

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: any[] | object }) => Promise<any>;
      on?: (event: string, cb: (...args: any[]) => void) => void;
      removeListener?: (event: string, cb: (...args: any[]) => void) => void;
    };
  }
}

/** SSR‑safe: devuelve window.ethereum si existe */
export function getEthereum() {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

/** Provider inyectado por MetaMask */
export function getProvider(): BrowserProvider | null {
  const eth = getEthereum();
  if (!eth) return null;
  // 'any' evita bloquear el provider si el usuario cambia de red mientras la app corre
  return new BrowserProvider(eth, "any");
}

/** Solicita cuentas al usuario */
export async function connectWalletRequest(): Promise<string | null> {
  const eth = getEthereum();
  if (!eth) {
    alert("MetaMask no está instalado. Instálalo para usar la dApp.");
    return null;
  }
  try {
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    return accounts[0] ?? null;
  } catch (error) {
    console.error("Error connecting wallet:", error);
    return null;
  }
}

/** Obtiene el signer actual (primera cuenta) */
export async function getSigner(): Promise<JsonRpcSigner | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    return await provider.getSigner();
  } catch (error) {
    console.error("Error getting signer:", error);
    return null;
  }
}

/** Balance de una dirección (ETH formateado y wei bruto) */
export async function getBalance(address: string): Promise<{ eth: string; wei: bigint }> {
  const provider = getProvider();
  if (!provider) return { eth: "0", wei: 0n };
  try {
    const wei = await provider.getBalance(address);
    return { eth: formatEther(wei), wei };
  } catch (error) {
    console.error("Error getting balance:", error);
    return { eth: "0", wei: 0n };
  }
}

/** Lee el chainId actual */
export async function getChainId(): Promise<number | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const net = await provider.getNetwork();
    return Number(net.chainId);
  } catch (error) {
    console.error("Error getting chain id:", error);
    return null;
  }
}

/** Cambia a una red; si no existe, intenta agregarla */
export async function switchNetwork(chainIdDec: number): Promise<boolean> {
  const eth = getEthereum();
  if (!eth) return false;
  const chainIdHex = `0x${chainIdDec.toString(16)}`;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
    return true;
  } catch (error: any) {
    if (error?.code === 4902) {
      // La red no está agregada → la agregamos
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: "Localhost",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["http://127.0.0.1:8545"],
              blockExplorerUrls: [],
            },
          ],
        });
        // Después del add, hacemos el switch
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
        return true;
      } catch (err2) {
        console.error("Error adding/switching network:", err2);
        return false;
      }
    }
    console.error("Error switching network:", error);
    return false;
  }
}

/** Helpers de eventos para refrescar UI cuando cambian cuentas o red */
export function onAccountsChanged(handler: (accounts: string[]) => void) {
  const eth = getEthereum();
  eth?.on?.("accountsChanged", handler as any);
  return () => eth?.removeListener?.("accountsChanged", handler as any);
}

export function onChainChanged(handler: (chainIdHex: string) => void) {
  const eth = getEthereum();
  eth?.on?.("chainChanged", handler as any);
  return () => eth?.removeListener?.("chainChanged", handler as any);
}

/** Flujo completo de conexión recomendado:
 *  1) Solicitar cuenta
 *  2) Cambiar/asegurar chainId 31337
 *  3) Devolver address, signer y chainId
 */
export async function connectWallet(): Promise<{
  address: string | null;
  signer: JsonRpcSigner | null;
  chainId: number | null;
}> {
  const address = await connectWalletRequest();
  if (!address) return { address: null, signer: null, chainId: null };

  const switched = await switchNetwork(LOCAL_CHAIN_ID_DEC);
  if (!switched) {
    console.warn("No se pudo cambiar/agregar la red 31337. Verifica tu MetaMask.");
  }

  const signer = await getSigner();
  const chainId = await getChainId();
  return { address, signer, chainId };
}
