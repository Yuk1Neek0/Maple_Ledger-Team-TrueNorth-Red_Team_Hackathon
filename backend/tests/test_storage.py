"""SQLite store + transparency log unit tests (P3.1)."""
from app.storage import open_db, _chain_hash


def test_insert_returns_log_entry_first_time_then_none():
    db = open_db(":memory:")
    wire = {"supplier_id": "S", "output": {"product_id": "p"}}
    log1 = db.insert_attestation("aaaa", wire)
    assert log1 is not None
    assert log1["seq"] == 1
    assert log1["prev_chain"] is None
    # idempotent: re-insert is a no-op, returns None
    log2 = db.insert_attestation("aaaa", wire)
    assert log2 is None


def test_log_chain_continuity():
    db = open_db(":memory:")
    a = db.insert_attestation("aa" * 32, {"supplier_id": "S", "output": {"product_id": "x"}})
    b = db.insert_attestation("bb" * 32, {"supplier_id": "S", "output": {"product_id": "y"}})
    c = db.insert_attestation("cc" * 32, {"supplier_id": "S", "output": {"product_id": "z"}})
    # rolling chain: each entry includes the previous chain hash + new leaf
    assert b["prev_chain"] == a["chain_hash"]
    assert c["prev_chain"] == b["chain_hash"]
    assert b["chain_hash"] == _chain_hash(a["chain_hash"], "bb" * 32)


def test_log_head_and_inclusion_lookup():
    db = open_db(":memory:")
    db.insert_attestation("aa" * 32, {"supplier_id": "S", "output": {"product_id": "x"}})
    db.insert_attestation("bb" * 32, {"supplier_id": "S", "output": {"product_id": "y"}})
    head = db.log_head()
    assert head["seq"] == 2 and head["attestation_hash"] == "bb" * 32
    entry = db.log_entry_for("aa" * 32)
    assert entry["seq"] == 1
    assert db.log_entry_for("nonexistent") is None


def test_verify_log_integrity_walks_chain():
    db = open_db(":memory:")
    for i in range(5):
        db.insert_attestation(f"{i:064x}", {"supplier_id": "S", "output": {"product_id": str(i)}})
    ok, err = db.verify_log_integrity()
    assert ok and err is None


def test_tampered_log_is_detected():
    db = open_db(":memory:")
    db.insert_attestation("aa" * 32, {"supplier_id": "S", "output": {"product_id": "x"}})
    db.insert_attestation("bb" * 32, {"supplier_id": "S", "output": {"product_id": "y"}})
    # Manually corrupt one chain_hash to simulate ledger tampering.
    db.conn.execute("UPDATE transparency_log SET chain_hash='dead' WHERE seq=1")
    db.conn.commit()
    ok, err = db.verify_log_integrity()
    assert not ok and err and "seq=1" in err


def test_iter_attestations_and_count():
    db = open_db(":memory:")
    db.insert_attestation("aa" * 32, {"supplier_id": "S", "output": {"product_id": "x"}})
    db.insert_attestation("bb" * 32, {"supplier_id": "S", "output": {"product_id": "y"}})
    items = list(db.iter_attestations())
    assert len(items) == 2
    assert db.count_attestations() == 2


def test_get_attestation_returns_original_wire():
    db = open_db(":memory:")
    wire = {"supplier_id": "S", "output": {"product_id": "x"}, "extra": [1, 2, 3]}
    db.insert_attestation("aa" * 32, wire)
    got = db.get_attestation("aa" * 32)
    assert got == wire
    assert db.get_attestation("nope") is None
