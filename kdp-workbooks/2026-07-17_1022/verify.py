#!/usr/bin/env python3
"""Independently recompute answers by re-running the same generation logic and
compare with what the build produced (answers.json)."""
import random, json

# Replicate EXACT generation to recompute answers independently
random.seed(717)

# Skip title/howto (no RNG). Tracing pages 0-20 use no random.
# Then counting pages
counting = []
num = 0
for p in range(20):
    for k in range(4):
        cnt = random.randint(1,20)
        shp = random.choice(["circle","square","star","triangle","heart"])
        num += 1
        counting.append([num, cnt])
# missing
missing = []
mnum = 0
for p in range(8):
    for k in range(4):
        start = random.randint(0,15)
        seq_vals = [start, start+1, start+2, start+3, start+4]
        blank = random.randint(1,3)
        ans = seq_vals[blank]
        mnum += 1
        missing.append([mnum, ans])

built = json.load(open("answers.json"))
bc = [list(x) for x in built["counting"]]
bm = [list(x) for x in built["missing"]]

c_mis = sum(1 for a,b in zip(counting, bc) if a != b) + abs(len(counting)-len(bc))
m_mis = sum(1 for a,b in zip(missing, bm) if a != b) + abs(len(missing)-len(bm))

# sanity: all counting answers in 1..20, missing in 0..19
c_range = all(1<=a<=20 for _,a in bc)
m_range = all(0<=a<=19 for _,a in bm)

print("counting problems:", len(bc), "recomputed:", len(counting), "mismatches:", c_mis, "range_ok:", c_range)
print("missing problems:", len(bm), "recomputed:", len(missing), "mismatches:", m_mis, "range_ok:", m_range)
print("TOTAL answerable:", len(bc)+len(bm))
print("cover claim '100+' consistent:", (len(bc)+len(bm)) >= 100)
print("VERDICT:", "CLEAN" if (c_mis==0 and m_mis==0 and c_range and m_range) else "FAIL")
