require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PK = process.env.WAGON_DEPLOYER_PK || process.env.PRIVATE_KEY || "0x" + "1".repeat(64);

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    // Base Sepolia — primary testnet
    base_sepolia: {
      url:      "https://sepolia.base.org",
      chainId:  84532,
      accounts: [PK],
      gasPrice: "auto",
    },
    // Base L2 Mainnet
    base: {
      url:      process.env.BASE_RPC_URL || "https://mainnet.base.org",
      chainId:  8453,
      accounts: [PK],
      gasPrice: "auto",
    },
    // RAWNet Testnet (when live)
    rawnet_testnet: {
      url:      process.env.RAWNET_RPC_URL || "https://testnet-rpc.rawnet.io",
      chainId:  720701,
      accounts: [PK],
      gasPrice: 60, // 60 wei = 0.00006 Gwei
    },
    // Local Hardhat
    localhost: {
      url:      "http://127.0.0.1:8545",
      chainId:  31337,
    },
  },
  etherscan: {
    apiKey: {
      base:        process.env.BASESCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
    },
    customChains: [{
      network:    "baseSepolia",
      chainId:    84532,
      urls: {
        apiURL:     "https://api-sepolia.basescan.org/api",
        browserURL: "https://sepolia.basescan.org",
      },
    }],
  },
  paths: {
    sources:   "./contracts",
    tests:     "./tests/hardhat",
    artifacts: "./artifacts",
    cache:     "./cache",
  },
};
