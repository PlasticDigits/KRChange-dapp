#!/usr/bin/env python3
"""
Generate public/tokenlist.json by reading token metadata on-chain.

Reads images under public/tokens/kasplex-testnet to determine addresses,
then queries the KasPlex RPC for ERC-20 name, symbol, and decimals via eth_call.

Env overrides:
  KASPLEX_RPC   (default: https://rpc.kasplextest.xyz)
  CHAIN_ID      (default: 167012)
"""
import json
import os
from datetime import datetime
from urllib import request

ROOT = os.path.dirname(os.path.dirname(__file__))
PUBLIC_DIR = os.path.join(ROOT, "public")
CONFIG_PATH = os.path.join(PUBLIC_DIR, "config.json")
OUT = os.path.join(PUBLIC_DIR, "tokenlist.json")
# Global RPC URL used by rpc_call; set per-network in main()
RPC_URL = os.environ.get("KASPLEX_RPC")  # fallback to config per-chain rpc

SELECTOR_NAME = "0x06fdde03"    # name()
SELECTOR_SYMBOL = "0x95d89b41"  # symbol()
SELECTOR_DECIMALS = "0x313ce567"# decimals()

def rpc_call(to: str, data: str) -> str | None:
  payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_call",
    "params": [
      {"to": to, "data": data},
      "latest",
    ],
  }
  req = request.Request(RPC_URL, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
  try:
    with request.urlopen(req, timeout=15) as resp:
      data = json.loads(resp.read().decode())
      return data.get("result")
  except Exception:
    return None

def _hex_to_bytes(hexstr: str) -> bytes:
  if hexstr.startswith("0x"): hexstr = hexstr[2:]
  return bytes.fromhex(hexstr)

def decode_abi_string(hexdata: str | None) -> str | None:
  if not hexdata: return None
  b = _hex_to_bytes(hexdata)
  if len(b) >= 64:
    try:
      # dynamic string: [offset][..padding..][len][data]
      offset = int.from_bytes(b[0:32], "big")
      if offset + 32 <= len(b):
        strlen = int.from_bytes(b[offset:offset+32], "big")
        start = offset + 32
        end = start + strlen
        if end <= len(b):
          return b[start:end].decode(errors="ignore").strip("\x00")
    except Exception:
      pass
  # fallback: bytes32 padded string in first 32 bytes
  try:
    raw = b[:32].rstrip(b"\x00")
    if raw:
      return raw.decode(errors="ignore")
  except Exception:
    pass
  return None

def decode_uint256(hexdata: str | None) -> int | None:
  if not hexdata: return None
  b = _hex_to_bytes(hexdata)
  if len(b) >= 32:
    return int.from_bytes(b[-32:], "big")
  return None

def read_token_meta(address: str) -> tuple[str, str, int]:
  name = decode_abi_string(rpc_call(address, SELECTOR_NAME)) or address[:6]
  symbol = decode_abi_string(rpc_call(address, SELECTOR_SYMBOL)) or address[:4].upper()
  decimals = decode_uint256(rpc_call(address, SELECTOR_DECIMALS)) or 18
  # bound decimals to sane range
  if not (0 <= decimals <= 36):
    decimals = 18
  return name, symbol, decimals

def main():
  with open(CONFIG_PATH) as f:
    cfg = json.load(f)
  networks = cfg.get("networks", {})
  _default_network_id = int(cfg.get("defaultNetworkId", 167012))
  items = []
  for id_str, net in networks.items():
    cid = int(id_str)
    # resolve RPC per network
    rpc = os.environ.get("KASPLEX_RPC") or net.get("rpcUrl")
    global RPC_URL
    RPC_URL = rpc
    tokens_dir = os.path.join(PUBLIC_DIR, "tokens", id_str)
    if not os.path.isdir(tokens_dir):
      continue
    for fn in sorted(os.listdir(tokens_dir)):
      if not fn.endswith(".png"):
        continue
      addr = os.path.splitext(fn)[0]
      name, symbol, decimals = read_token_meta(addr)
      items.append({
        "address": addr,
        "symbol": symbol,
        "name": name,
        "decimals": decimals,
        "chainId": cid,
        "logoURI": f"/tokens/{id_str}/{fn}",
      })

  tokenlist = {
    "name": "KasPlex Testnet Tokens (KRChange)",
    "timestamp": datetime.utcnow().isoformat() + "Z",
    "version": {"major": 0, "minor": 1, "patch": 0},
    "tokens": items,
  }

  with open(OUT, "w") as f:
    json.dump(tokenlist, f, indent=2)

  print(f"Wrote {len(items)} tokens to {OUT}")

if __name__ == "__main__":
  main()


