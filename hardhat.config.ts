import type { HardhatUserConfig } from 'hardhat/config';
import 'dotenv/config';

const BASE_RPC_URL = process.env['BASE_RPC_URL'] ?? 'https://mainnet.base.org';
const PRIVATE_KEY = process.env['PRIVATE_KEY'];

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    base: {
      type: 'http',
      url: BASE_RPC_URL,
      chainId: 8453,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    localhost: {
      type: 'http',
      url: 'http://127.0.0.1:8545',
    },
  },
  paths: {
    sources: './contracts',
    tests: './contracts/__tests__',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
