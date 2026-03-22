require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../../.env" });
const PK = process.env.PRIVATE_KEY || "0x"+"0".repeat(64);
module.exports = {
  solidity: { version:"0.8.24", settings:{ optimizer:{enabled:true,runs:200} } },
  networks: {
    rawnet_testnet: { url:"https://testnet-rpc.rawnet.io", chainId:720701, accounts:[PK], gasPrice:60 },
    base:           { url: process.env.BASE_RPC_URL||"https://mainnet.base.org", chainId:8453, accounts:[PK] },
    base_sepolia:   { url:"https://sepolia.base.org", chainId:84532, accounts:[PK] },
    localhost:      { url:"http://127.0.0.1:8545", chainId:31337 }
  },
  paths: { sources:"../../contracts", tests:"../../tests", artifacts:"./artifacts" }
};
