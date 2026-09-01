import { defineChain } from "viem";

export const sepoliaL2 = defineChain({
  id: 84_532,
  name: "Sepolia L2 Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1"] } },
  testnet: true,
});
