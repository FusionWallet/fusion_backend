const express = require("express");
const router = express.Router();
require("dotenv").config();
const ethers = require("ethers");
const addressManager = require("../../lib/AddressManager.json");
const FusionProxyFactoryABI = require("../../lib/abi/FusionProxyFactory.json");
const FusionABI = require("../../lib/abi/Fusion.json");
const {
  deployBase,
  checkDomain,
  resolveHashAndNonce,
  deployExternal,
  deployRequest,
} = require("../../utils/contracts/deploy");
const { verify_password } = require("../../utils/circuits/password_prove");
const { pedersen_hash } = require("../../utils/circuits/pedersen_hash");
const { deploy_prove } = require("../../utils/circuits/deploy_prove");
const { verify_signature } = require("../../utils/circuits/signature_prove");

router.post("/:chainId", async (req, res) => {
  try {
    const { chainId } = req.params;

    if (!chainId) {
      return res.json({ success: false, error: "chainId is required" });
    }

    const currentChain = addressManager.find(
      (chain) => chain.chainId === Number(chainId)
    );

    if (!currentChain) {
      return res.json({ success: false, error: "Chain not found" });
    }

    // Check if the chain is the base chain
    const isBase = currentChain.isBase;

    if (isBase) {
      const forwardRequest = req.body.forwardRequest;

      if (!forwardRequest) {
        return res.json({
          success: false,
          error: "forwardRequest is required",
        });
      }

      const receipt = await deployBase(currentChain, forwardRequest);

      res.json({ success: true, receipt });
    } else {
      const chainDeployRequest = req.body.chainDeployRequest;

      if (!chainDeployRequest) {
        return res.json({
          success: false,
          error: "chainDeployRequest is required",
        });
      }

      const currentChain = addressManager.find(
        (chain) => chain.chainId === Number(chainId)
      );

      const provider = new ethers.providers.JsonRpcProvider(
        currentChain.rpcUrl
      );

      const factory = new ethers.Contract(
        currentChain.addresses.FusionProxyFactory,
        FusionProxyFactoryABI,
        provider
      );

      const isDomainTaken = await checkDomain(
        factory,
        chainDeployRequest.domain
      );

      if (isDomainTaken) {
        return res.json({ success: false, error: "Domain is already taken" });
      }

      const baseChain = addressManager.find((chain) => chain.isBase);

      const baseProvider = new ethers.providers.JsonRpcProvider(
        baseChain.rpcUrl
      );

      const baseFactory = new ethers.Contract(
        baseChain.addresses.FusionProxyFactory,
        FusionProxyFactoryABI,
        baseProvider
      );

      const isBaseDomainTaken = await checkDomain(
        baseFactory,
        chainDeployRequest.domain
      );

      if (!isBaseDomainTaken) {
        return res.json({
          success: false,
          error: "Domain is not taken on base chain",
        });
      }

      const { messageHash, hash } = await resolveHashAndNonce(
        baseFactory,
        chainDeployRequest,
        baseProvider
      );

      let isVerified;

      if (chainDeployRequest.type === "password") {
        isVerified = await verify_password(
          messageHash,
          hash,
          chainDeployRequest.proof,
          chainDeployRequest.address
        );
      } else {
        isVerified = await verify_signature(
          messageHash,
          hash,
          chainDeployRequest.proof,
          chainDeployRequest.address
        );
      }

      if (!isVerified) {
        return res.json({ success: false, error: "Proof is invalid" });
      }

      const serverHash = await pedersen_hash(
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(process.env.PASSCODE)),
        ethers.utils.hexZeroPad(currentChain.chainId, 32)
      );

      const serverProof = await deploy_prove(
        provider,
        chainDeployRequest.domain,
        serverHash,
        currentChain.chainId
      );

      const receipt = await deployExternal(
        provider,
        currentChain,
        chainDeployRequest,
        serverProof
      );

      res.json({ success: true, receipt });
    }
  } catch (err) {
    console.log(err);
    res.json({ success: false, error: err.message });
  }
});

router.post("/request/:chainId", async (req, res) => {
  try {
    const { chainId } = req.params;

    if (!chainId) {
      return res.json({ success: false, error: "chainId is required" });
    }

    const currentChain = addressManager.find(
      (chain) => chain.chainId === Number(chainId)
    );

    // Check if the chain is the base chain
    const isBase = currentChain.isBase;

    if (isBase) {
      return res.json({ success: false, error: "Base chain cannot request" });
    }

    const chainDeployRequest = req.body.chainDeployRequest;

    if (!chainDeployRequest) {
      return res.json({
        success: false,
        error: "chainDeployRequest is required",
      });
    }

    const provider = new ethers.providers.JsonRpcProvider(currentChain.rpcUrl);

    const factory = new ethers.Contract(
      currentChain.addresses.FusionProxyFactory,
      FusionProxyFactoryABI,
      provider
    );

    const isDomainTaken = await checkDomain(factory, chainDeployRequest.domain);

    if (isDomainTaken) {
      return res.json({ success: false, error: "Domain is already taken" });
    }

    const baseChain = addressManager.find((chain) => chain.isBase);

    const baseProvider = new ethers.providers.JsonRpcProvider(baseChain.rpcUrl);

    const baseFactory = new ethers.Contract(
      baseChain.addresses.FusionProxyFactory,
      FusionProxyFactoryABI,
      baseProvider
    );

    const isBaseDomainTaken = await checkDomain(
      baseFactory,
      chainDeployRequest.domain
    );

    if (!isBaseDomainTaken) {
      return res.json({
        success: false,
        error: "Domain is not taken on base chain",
      });
    }

    const { hash, baseFusionAddress } = await resolveHashAndNonce(
      baseFactory,
      chainDeployRequest,
      baseProvider
    );

    const messageHash = ethers.utils.hashMessage("9999");

    let isVerified;

    if (chainDeployRequest.type === "password") {
      isVerified = await verify_password(
        messageHash,
        hash,
        chainDeployRequest.proof,
        baseFusionAddress
      );
    } else {
      isVerified = await verify_signature(
        messageHash,
        hash,
        chainDeployRequest.proof,
        baseFusionAddress
      );
    }

    if (!isVerified) {
      return res.json({ success: false, error: "Proof is invalid" });
    }

    // const serverHash = await pedersen_hash(
    //   ethers.utils.hexlify(ethers.utils.toUtf8Bytes(process.env.PASSCODE)),
    //   ethers.utils.hexZeroPad(currentChain.chainId, 32)
    // );

    // const serverProof = await deploy_prove(
    //   provider,
    //   chainDeployRequest.domain,
    //   serverHash,
    //   currentChain.chainId
    // );

    const receipt = await deployRequest(
      provider,
      currentChain,
      chainDeployRequest,
      chainDeployRequest.proof
    );

    res.json({ success: true, receipt });
  } catch (err) {
    console.log(err);
    res.json({ success: false, error: err.message });
  }
});

router.get("/getHash/:chainId", async (req, res) => {
  const chainId = req.params.chainId;

  const serverHash = await pedersen_hash(
    ethers.utils.hexlify(ethers.utils.toUtf8Bytes(process.env.PASSCODE)),
    ethers.utils.hexZeroPad(Number(chainId), 32)
  );

  return res.json({ success: true, serverHash });
});

router.get("/getAddress/:domain", async (req, res) => {
  try {
    const domain = req.params.domain;

    if (!domain) {
      return res.json({ success: false, error: "domain is required" });
    }

    const baseChain = addressManager.find((chain) => chain.isBase);

    if (!baseChain) {
      return res.json({ success: false, error: "Base chain not found" });
    }

    const provider = new ethers.providers.JsonRpcProvider(baseChain.rpcUrl);

    const factory = new ethers.Contract(
      baseChain.addresses.FusionProxyFactory,
      FusionProxyFactoryABI,
      provider
    );

    const walletAddress = await factory.callStatic.createProxyWithDomain(
      domain,
      "0x"
    );

    return res.json({ success: true, walletAddress });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post("/finalize/:chainId/:domain", async (req, res) => {
  try {
    const chainId = req.params.chainId;
    const domain = req.params.domain;

    if (!chainId) {
      return res.json({ success: false, error: "chainId is required" });
    }

    if (!domain) {
      return res.json({ success: false, error: "domain is required" });
    }

    const currentChain = addressManager.find(
      (chain) => chain.chainId === Number(chainId)
    );

    if (!currentChain) {
      return res.json({ success: false, error: "Chain not found" });
    }

    const provider = new ethers.providers.JsonRpcProvider(currentChain.rpcUrl);

    const factory = new ethers.Contract(
      currentChain.addresses.FusionProxyFactory,
      FusionProxyFactoryABI,
      provider
    );

    if (currentChain.isBase) {
      return res.json({ success: false, error: "Base chain cannot finalize" });
    }

    const request = await factory.requests(domain);

    if (!request || !request.fulfilled) {
      return res.json({ success: false, error: "Request not fulfilled" });
    }

    const finalizeData = factory.interface.encodeFunctionData(
      "finalizeProxyWithRequest",
      [domain]
    );

    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // Estimate Gas Price
    const gasPrice = Number(await provider.getGasPrice());

    const unSignedTx = {
      to: currentChain.addresses.FusionProxyFactory,
      data: finalizeData,
      value: 0,
      gasLimit:
        currentChain.chainId === 84532 || currentChain.chainId === 11155420
          ? null
          : 2000000,
      gasPrice:
        currentChain.chainId === 84532 || currentChain.chainId === 11155420
          ? gasPrice
          : null,
    };

    const signedTx = await signer.sendTransaction(unSignedTx);

    const receipt = await signedTx.wait();

    return res.json({ success: true, receipt });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.get("/verify/:domain/:chainId", async (req, res) => {
  try {
    const domain = req.params.domain;

    const chainId = req.params.chainId;

    if (!domain) {
      return res.json({ success: false, error: "domain is required" });
    }

    if (!chainId) {
      return res.json({ success: false, error: "chainId is required" });
    }

    const currentChain = addressManager.find(
      (chain) => chain.chainId === Number(chainId)
    );

    if (!currentChain) {
      return res.json({ success: false, error: "Chain not found" });
    }

    if (currentChain.isBase) {
      return res.json({ success: false, error: "Base chain cannot verify" });
    }

    const sProvider = new ethers.providers.JsonRpcProvider(currentChain.rpcUrl);

    const sFactory = new ethers.Contract(
      currentChain.addresses.FusionProxyFactory,
      FusionProxyFactoryABI,
      sProvider
    );

    const baseChain = addressManager.find((chain) => chain.isBase);

    if (!baseChain) {
      return res.json({ success: false, error: "Base chain not found" });
    }

    const provider = new ethers.providers.JsonRpcProvider(baseChain.rpcUrl);

    const factory = new ethers.Contract(
      baseChain.addresses.FusionProxyFactory,
      FusionProxyFactoryABI,
      provider
    );

    const fusion = await factory.getFusionProxy(domain);

    if (fusion === ethers.constants.AddressZero) {
      throw new Error("Fusion not found");
    }

    const fusionContract = new ethers.Contract(fusion, FusionABI, provider);

    const TxHash = await fusionContract.TxHash();
    const RecoveryHash = await fusionContract.RecoveryHash();
    const publicStorage = await fusionContract.PublicStorage();

    const request = await sFactory.requests(domain);

    if (!request) {
      return res.json({ success: false, error: "Request not found" });
    }

    const initializer = request.initializer;

    const data = fusionContract.interface.encodeFunctionData("setupFusion", [
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(domain?.toLowerCase() + ".fusion.id")
      ),
      currentChain.addresses.PasswordVerifier,
      currentChain.addresses.SignatureVerifier,
      currentChain.addresses.FusionForwarder,
      currentChain.addresses.FusionGasTank,
      TxHash,
      RecoveryHash,
      publicStorage,
    ]);

    if (initializer !== data) {
      return res.json({ success: false, error: "Initializer mismatch" });
    } else {
      return res.json({ success: true });
    }

    // const hash = ethers.utils.hashMessage("9999");

    // const isVerified = await fusionContract.isValidSignature(
    //   hash,
    //   proof.startsWith("0x") ? proof : `0x${proof}`
    // );

    // if (isVerified) {
    //   return res.json({ success: true });
    // } else {
    //   return res.json({ success: false });
    // }
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

module.exports = router;
