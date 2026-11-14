import sqlite3
import os
import sys
import glob
import json

def read_varint(buf, i):
    val = 0
    shift = 0
    while i < len(buf):
        b = buf[i]
        i += 1
        val |= (b & 0x7f) << shift
        if not (b & 0x80):
            return val, i
        shift += 7
    return val, i

def parse_pb_map(buf):
    i = 0
    fields = {}
    while i < len(buf):
        try:
            tag, i = read_varint(buf, i)
            fn, wt = tag >> 3, tag & 7
            if fn == 0:
                break
            if wt == 0:
                val, i = read_varint(buf, i)
                fields.setdefault(fn, []).append(val)
            elif wt == 2:
                ln, i = read_varint(buf, i)
                if ln < 0 or i + ln > len(buf):
                    break
                sub = buf[i:i+ln]
                i += ln
                fields.setdefault(fn, []).append(sub)
            elif wt == 5:
                fields.setdefault(fn, []).append(buf[i:i+4])
                i += 4
            elif wt == 1:
                fields.setdefault(fn, []).append(buf[i:i+8])
                i += 8
            else:
                break
        except Exception:
            break
    return fields

def parse_gen_row(idx, data):
    top = parse_pb_map(data)
    if 1 not in top:
        return None
    m1 = parse_pb_map(top[1][0])
    usage = parse_pb_map(m1.get(4, [b""])[0])
    uncached_in = usage.get(2, [0])[0]
    cached_in = usage.get(5, [0])[0]
    think_tok = usage.get(9, [0])[0]
    out_tok = usage.get(10, [0])[0]
    ctx = uncached_in + cached_in

    max_ctx = 0
    if 9 in m1:
        m9 = parse_pb_map(m1[9][0])
        if 10 in m9:
            m10 = parse_pb_map(m9[10][0])
            max_ctx = m10.get(4, [0])[0]

    backend_model = m1.get(19, [b""])[0].decode("utf-8", errors="ignore")
    display_model = m1.get(21, [b""])[0].decode("utf-8", errors="ignore")

    return {
        "turn": idx,
        "backend_model": backend_model,
        "display_model": display_model,
        "uncached_in": uncached_in,
        "cached_in": cached_in,
        "context_tokens": ctx,
        "out_tokens": out_tok,
        "think_tokens": think_tok,
        "max_context_tokens": max_ctx,
    }

def main():
    conv_dir = os.path.expanduser("~/.gemini/antigravity/conversations")
    target_id = sys.argv[1].strip() if len(sys.argv) > 1 else ""
    if target_id:
        db_path = os.path.join(conv_dir, f"{target_id}.db")
    else:
        dbs = sorted(glob.glob(os.path.join(conv_dir, "*.db")), key=os.path.getmtime, reverse=True)
        if not dbs:
            print(json.dumps({"error": "No conversation databases found"}))
            return
        db_path = dbs[0]

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    rows = conn.execute("SELECT idx, data FROM gen_metadata ORDER BY idx ASC").fetchall()
    conn.close()

    turns = []
    max_ctx = 256000
    for idx, data in rows:
        p = parse_gen_row(idx, data)
        if not p or p["context_tokens"] == 0:
            continue
        if p["max_context_tokens"] > 0:
            max_ctx = p["max_context_tokens"]
        turns.append(p)

    latest = turns[-1] if turns else {"cached_in": 0, "uncached_in": 0, "context_tokens": 0, "backend_model": "", "display_model": ""}
    ctx = latest["context_tokens"]
    summary = {
        "backend_model": latest.get("backend_model", ""),
        "display_model": latest.get("display_model", ""),
        "used_tokens": ctx,
        "max_context_tokens": max_ctx,
        "used_pct": round(ctx / max_ctx * 100, 1) if max_ctx else 0,
        "cached": latest["cached_in"],
        "cached_pct": round(latest["cached_in"] / max_ctx * 100, 1) if max_ctx else 0,
        "uncached": latest["uncached_in"],
        "uncached_pct": round(latest["uncached_in"] / max_ctx * 100, 1) if max_ctx else 0,
        "out_tokens": sum(t["out_tokens"] for t in turns),
        "think_tokens": sum(t["think_tokens"] for t in turns),
        "turn0_tokens": turns[0]["context_tokens"] if turns else 0,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
