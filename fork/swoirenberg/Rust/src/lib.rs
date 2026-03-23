use noir_rs::{
    barretenberg::{
        prove::{prove_ultra_honk, prove_ultra_honk_keccak},
        srs::{setup_srs, setup_srs_from_bytecode, setup_grumpkin_srs, setup_srs_from_raw, GRUMPKIN_SRS_SIZE},
        verify::{verify_ultra_honk, get_ultra_honk_verification_key, verify_ultra_honk_keccak, get_ultra_honk_keccak_verification_key},
        chonk,
    },
    execute::execute,
    acir::native_types::{Witness, WitnessMap},
    AcirField, FieldElement,
};

// Expose functions using FFI and swift-bridge so we can call them in Swift
#[swift_bridge::bridge]
mod ffi {
    extern "Rust" {
        // ── Existing SRS ──
        fn setup_srs_swift(circuit_size: u32, srs_path: Option<&str>) -> Option<u32>;
        fn setup_srs_from_bytecode_swift(circuit_bytecode: String, srs_path: Option<&str>) -> Option<u32>;

        // ── Grumpkin SRS (new - required for chonk/IVC) ──
        fn setup_grumpkin_srs_swift(num_points: u32, srs_path: Option<&str>) -> Option<u32>;

        // ── Raw SRS init (returns empty string on success, error message on failure) ──
        fn setup_srs_raw_swift(g1_data: Vec<u8>, num_points: u32) -> String;
        fn setup_grumpkin_srs_raw_swift(g1_data: Vec<u8>, num_points: u32) -> String;

        // ── Existing prove/verify/execute ──
        fn prove_swift(circuit_bytecode: String, initial_witness: Vec<String>, proof_type: String, vkey: Vec<u8>, low_memory_mode: bool, storage_cap: u64) -> Option<Vec<u8>>;
        fn verify_swift(proof: Vec<u8>, vkey: Vec<u8>, proof_type: String) -> Option<bool>;
        fn execute_swift(circuit_bytecode: String, initial_witness: Vec<String>) -> Option<Vec<String>>;
        fn get_vkey_swift(circuit_bytecode: String, proof_type: String, low_memory_mode: bool, storage_cap: u64) -> Option<Vec<u8>>;

        // ── Chonk/IVC pipeline (new) ──
        fn chonk_start_swift(num_circuits: u32) -> Option<bool>;
        fn chonk_load_swift(name: String, bytecode: Vec<u8>, verification_key: Vec<u8>) -> Option<bool>;
        fn chonk_accumulate_swift(witness: Vec<u8>) -> Option<bool>;
        fn chonk_prove_swift() -> Option<Vec<u8>>;
        fn chonk_verify_swift(proof: Vec<u8>, vk: Vec<u8>) -> Option<bool>;
        fn chonk_compute_vk_swift(bytecode: Vec<u8>) -> Option<Vec<u8>>;
        fn chonk_destroy_swift() -> Option<bool>;

        // ── High-level transaction proving (new) ──
        // Takes JSON-encoded steps because swift-bridge doesn't support Vec<Vec<u8>>.
        // JSON format: [{"name":"...","bytecode":"<base64>","witness":"<base64>","vkey":"<base64>"}]
        fn chonk_prove_transaction_swift(
            steps_json: String,
            low_memory_mode: bool,
            storage_cap: u64,
        ) -> Option<Vec<u8>>;
    }
}

// ═══════════════════════════════════════════════════════════════════
// Existing functions (unchanged)
// ═══════════════════════════════════════════════════════════════════

pub fn prove_swift(circuit_bytecode: String, initial_witness: Vec<String>, proof_type: String, vkey: Vec<u8>, low_memory_mode: bool, storage_cap: u64) -> Option<Vec<u8>> {
    let initial_witness_vec: Vec<FieldElement> = initial_witness
        .into_iter()
        .map(|s| FieldElement::try_from_str(&s).unwrap())
        .collect();
    let mut initial_witness = WitnessMap::new();
    for (i, witness) in initial_witness_vec.into_iter().enumerate() {
        initial_witness.insert(Witness(i as u32), witness);
    }

    if proof_type == "ultra_honk" {
        let proof = prove_ultra_honk(&circuit_bytecode, initial_witness, vkey, low_memory_mode, Some(storage_cap)).ok()?;
        return Some(proof);
    } else if proof_type == "ultra_honk_keccak" {
        let proof = prove_ultra_honk_keccak(&circuit_bytecode, initial_witness, vkey, false, low_memory_mode, Some(storage_cap)).ok()?;
        return Some(proof);
    } else {
        println!("Unsupported proof type");
        return None;
    }
}

pub fn verify_swift(proof: Vec<u8>, vkey: Vec<u8>, proof_type: String) -> Option<bool> {
    if proof_type == "ultra_honk" {
        verify_ultra_honk(proof, vkey).ok()
    } else if proof_type == "ultra_honk_keccak" {
        verify_ultra_honk_keccak(proof, vkey, false).ok()
    } else {
        println!("Unsupported proof type");
        return None;
    }
}

pub fn setup_srs_swift(circuit_size: u32, srs_path: Option<&str>) -> Option<u32> {
    setup_srs(circuit_size, srs_path).ok()
}

pub fn setup_srs_from_bytecode_swift(circuit_bytecode: String, srs_path: Option<&str>) -> Option<u32> {
    setup_srs_from_bytecode(&circuit_bytecode, srs_path, false).ok()
}

pub fn execute_swift(circuit_bytecode: String, initial_witness: Vec<String>) -> Option<Vec<String>> {
    let initial_witness_vec: Vec<FieldElement> = initial_witness
        .into_iter()
        .map(|s| FieldElement::try_from_str(&s).unwrap())
        .collect();
    let mut initial_witness_final = WitnessMap::new();
    for (i, witness) in initial_witness_vec.into_iter().enumerate() {
        initial_witness_final.insert(Witness(i as u32), witness);
    }

    let witness = execute(&circuit_bytecode, initial_witness_final).ok()?;
    let witness_map = &witness.peek().into_iter().last()?.witness;
    let witness_vec = witness_map.clone().into_iter().map(|(i, val)| format!("0x{}", val.to_hex())).collect();
    Some(witness_vec)
}

pub fn get_vkey_swift(circuit_bytecode: String, proof_type: String, low_memory_mode: bool, storage_cap: u64) -> Option<Vec<u8>> {
    if proof_type == "ultra_honk" {
        get_ultra_honk_verification_key(&circuit_bytecode, low_memory_mode, Some(storage_cap)).ok()
    } else if proof_type == "ultra_honk_keccak" {
        get_ultra_honk_keccak_verification_key(&circuit_bytecode, false, low_memory_mode, Some(storage_cap)).ok()
    } else {
        println!("Unsupported proof type");
        return None;
    }
}

// ═══════════════════════════════════════════════════════════════════
// New: Grumpkin SRS setup
// ═══════════════════════════════════════════════════════════════════

/// Set up Grumpkin curve SRS for IVC/chonk proving.
/// Must be called before any chonk operations.
pub fn setup_grumpkin_srs_swift(num_points: u32, srs_path: Option<&str>) -> Option<u32> {
    setup_grumpkin_srs(num_points, srs_path).ok()
}

// G2 point constant (same as in noir_rs srs/mod.rs)
const G2: [u8; 128] = [1, 24, 196, 213, 184, 55, 188, 194, 188, 137, 181, 179, 152, 181, 151, 78, 159, 89, 68, 7, 59, 50, 7, 139, 126, 35, 31, 236, 147, 136, 131, 176, 38, 14, 1, 178, 81, 246, 241, 199, 231, 255, 78, 88, 7, 145, 222, 232, 234, 81, 216, 122, 53, 142, 3, 139, 78, 254, 48, 250, 192, 147, 131, 193, 34, 254, 189, 163, 192, 192, 99, 42, 86, 71, 91, 66, 20, 229, 97, 94, 17, 230, 221, 63, 150, 230, 206, 162, 133, 74, 135, 212, 218, 204, 94, 85, 4, 252, 99, 105, 247, 17, 15, 227, 210, 81, 86, 193, 187, 154, 114, 133, 156, 242, 160, 70, 65, 249, 155, 164, 238, 65, 60, 128, 218, 106, 95, 228];

/// Direct SRS init from raw G1 bytes — returns empty string on success, error message on failure.
pub fn setup_srs_raw_swift(g1_data: Vec<u8>, num_points: u32) -> String {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        setup_srs_from_raw(&g1_data, num_points, &G2)
    })) {
        Ok(Ok(_)) => String::new(),
        Ok(Err(e)) => format!("srs_init error: {} (g1_len={}, num_points={})", e, g1_data.len(), num_points),
        Err(_) => format!("srs_init PANIC (g1_len={}, num_points={})", g1_data.len(), num_points),
    }
}

/// Direct Grumpkin SRS init from raw G1 bytes — returns empty string on success, error message on failure.
pub fn setup_grumpkin_srs_raw_swift(g1_data: Vec<u8>, num_points: u32) -> String {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        noir_rs::barretenberg::api::srs_init_grumpkin(&g1_data, num_points)
    })) {
        Ok(Ok(_)) => String::new(),
        Ok(Err(e)) => format!("grumpkin_srs_init error: {} (g1_len={}, num_points={})", e, g1_data.len(), num_points),
        Err(_) => format!("grumpkin_srs_init PANIC (g1_len={}, num_points={})", g1_data.len(), num_points),
    }
}

// ═══════════════════════════════════════════════════════════════════
// New: Chonk/IVC pipeline functions
// ═══════════════════════════════════════════════════════════════════

/// Initialize a chonk proving session for N circuits.
pub fn chonk_start_swift(num_circuits: u32) -> Option<bool> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        chonk::chonk_start(num_circuits)
    })) {
        Ok(Ok(_)) => Some(true),
        Ok(Err(e)) => { println!("[NativeProver-Rust] chonk_start error: {}", e); None },
        Err(_) => { println!("[NativeProver-Rust] chonk_start PANIC caught"); None },
    }
}

/// Load a circuit into the chonk session.
/// bytecode: uncompressed ACIR bytecode (not base64)
/// verification_key: pre-computed VK bytes
pub fn chonk_load_swift(name: String, bytecode: Vec<u8>, verification_key: Vec<u8>) -> Option<bool> {
    chonk::chonk_load(&name, &bytecode, &verification_key).ok().map(|_| true)
}

/// Accumulate witness for the most recently loaded circuit.
/// witness: serialized witness bytes
pub fn chonk_accumulate_swift(witness: Vec<u8>) -> Option<bool> {
    chonk::chonk_accumulate(&witness).ok().map(|_| true)
}

/// Generate IVC proof from all accumulated circuits.
/// Returns msgpack-serialized ChonkProof bytes.
pub fn chonk_prove_swift() -> Option<Vec<u8>> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let response = chonk::chonk_prove().ok()?;
        rmp_serde::to_vec_named(&response.proof).ok()
    })) {
        Ok(result) => result,
        Err(_) => { println!("[NativeProver-Rust] chonk_prove PANIC caught"); None },
    }
}

/// Verify a chonk proof against a verification key.
/// proof: msgpack-serialized ChonkProof bytes
/// vk: verification key bytes
pub fn chonk_verify_swift(proof: Vec<u8>, vk: Vec<u8>) -> Option<bool> {
    // Deserialize proof from msgpack
    let proof_response: noir_rs::barretenberg::api::ChonkProveResponse =
        rmp_serde::from_slice(&proof).ok()?;
    chonk::chonk_verify(&proof_response, &vk).ok()
}

/// Compute chonk verification key for a circuit.
/// bytecode: uncompressed ACIR bytecode
/// Returns VK bytes.
pub fn chonk_compute_vk_swift(bytecode: Vec<u8>) -> Option<Vec<u8>> {
    let response = chonk::chonk_compute_vk(&bytecode).ok()?;
    Some(response.bytes)
}

/// Destroy the current chonk session and free resources.
pub fn chonk_destroy_swift() -> Option<bool> {
    chonk::chonk_destroy().ok().map(|_| true)
}

/// High-level: prove a complete transaction in one call.
/// steps_json: JSON array of steps, each with base64-encoded fields:
///   [{"name":"...","bytecode":"<b64>","witness":"<b64>","vkey":"<b64>"}]
/// Returns msgpack-serialized ChonkProof bytes.
pub fn chonk_prove_transaction_swift(
    steps_json: String,
    low_memory_mode: bool,
    storage_cap: u64,
) -> Option<Vec<u8>> {
    use base64::Engine as _;
    let b64 = base64::engine::general_purpose::STANDARD;

    #[derive(serde::Deserialize)]
    struct Step {
        name: String,
        bytecode: String,
        witness: String,
        vkey: String,
    }

    let parsed_steps: Vec<Step> = serde_json::from_str(&steps_json).ok()?;

    let decoded: Vec<(String, Vec<u8>, Vec<u8>, Vec<u8>)> = parsed_steps
        .into_iter()
        .map(|s| {
            let bc = b64.decode(&s.bytecode).unwrap_or_default();
            let w = b64.decode(&s.witness).unwrap_or_default();
            let vk = b64.decode(&s.vkey).unwrap_or_default();
            (s.name, bc, w, vk)
        })
        .collect();

    let steps: Vec<(&str, &[u8], &[u8], &[u8])> = decoded
        .iter()
        .map(|(n, b, w, v)| (n.as_str(), b.as_slice(), w.as_slice(), v.as_slice()))
        .collect();

    let max_storage = if storage_cap > 0 { Some(storage_cap) } else { None };
    let response = chonk::prove_transaction(&steps, low_memory_mode, max_storage).ok()?;
    rmp_serde::to_vec_named(&response.proof).ok()
}
