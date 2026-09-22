"""
Generate a fresh Ethereum hot wallet for the platform settlement engine.
Run this ONCE to get the address and private key.
"""
from eth_account import Account
import secrets

# Generate a cryptographically secure random private key
private_key = "0x" + secrets.token_hex(32)
account = Account.from_key(private_key)

print("=" * 60)
print("  PLATFORM HOT WALLET (copy these into agent_backend/.env)")
print("=" * 60)
print(f"  Address:     {account.address}")
print(f"  Private Key: {private_key}")
print("=" * 60)
print()
print("  Fund this address with Sepolia ETH from:")
print("  https://sepoliafaucet.com  or  https://faucet.quicknode.com/ethereum/sepolia")
print()
print("  ~0.05 SepoliaETH is enough for hundreds of settle() calls.")
