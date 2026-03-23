//! Chonk (IVC) multi-circuit proving module.
//!
//! Provides incremental verification computation (IVC) proving for Aztec private
//! kernel transactions. Unlike single-circuit UltraHonk, chonk proving accumulates
//! multiple circuits (init → inner → reset → tail) into a single compound proof.
//!
//! The chonk pipeline is stateful:
//!   chonk_start(N) → chonk_load(circuit) → chonk_accumulate(witness) × N → chonk_prove()

use std::sync::Mutex;

use barretenberg_rs::{
    BarretenbergApi,
    backends::FfiBackend,
    generated_types::{
        CircuitInput, CircuitInputNoVK,
        ChonkProveResponse, ChonkComputeVkResponse,
    },
};

use crate::backends::barretenberg::api::configure_memory;

/// Global chonk session. The IVC pipeline requires maintaining state across
/// multiple calls (Start → Load → Accumulate → Prove), so we keep a persistent
/// BarretenbergApi instance for the duration of a chonk session.
static CHONK_SESSION: Mutex<Option<BarretenbergApi<FfiBackend>>> = Mutex::new(None);

fn get_or_create_session() -> Result<(), String> {
    let mut session = CHONK_SESSION
        .lock()
        .map_err(|e| format!("Failed to lock chonk session: {}", e))?;
    if session.is_none() {
        let backend = FfiBackend::new()
            .map_err(|e| format!("Failed to initialize FfiBackend: {}", e))?;
        *session = Some(BarretenbergApi::new(backend));
    }
    Ok(())
}

fn with_session<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut BarretenbergApi<FfiBackend>) -> Result<R, String>,
{
    // Catch any panics from the C++ FFI layer to prevent SIGABRT
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut session = CHONK_SESSION
            .lock()
            .map_err(|e| format!("Failed to lock chonk session: {}", e));
        match session {
            Ok(ref mut guard) => match guard.as_mut() {
                Some(api) => f(api),
                None => Err("Chonk session not initialized. Call chonk_start first.".to_string()),
            },
            Err(e) => Err(e),
        }
    }));
    match result {
        Ok(inner) => inner,
        Err(panic_info) => {
            let msg = if let Some(s) = panic_info.downcast_ref::<&str>() {
                format!("Native prover panicked: {}", s)
            } else if let Some(s) = panic_info.downcast_ref::<String>() {
                format!("Native prover panicked: {}", s)
            } else {
                "Native prover panicked (unknown error)".to_string()
            };
            Err(msg)
        }
    }
}

fn _with_session_old<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut BarretenbergApi<FfiBackend>) -> Result<R, String>,
{
    let mut session = CHONK_SESSION
        .lock()
        .map_err(|e| format!("Failed to lock chonk session: {}", e))?;
    match session.as_mut() {
        Some(api) => f(api),
        None => Err("Chonk session not initialized. Call chonk_start first.".to_string()),
    }
}

/// Initialize a chonk proving session for the given number of circuits.
///
/// Must be called before any chonk_load/chonk_accumulate calls.
/// Creates a fresh BarretenbergApi session if one doesn't exist.
///
/// # Arguments
/// * `num_circuits` - Number of circuits that will be loaded and accumulated
pub fn chonk_start(num_circuits: u32) -> Result<(), String> {
    get_or_create_session()?;
    with_session(|api| {
        api.chonk_start(num_circuits.into())
            .map_err(|e| format!("chonk_start failed: {}", e))?;
        Ok(())
    })
}

/// Load a circuit into the current chonk session.
///
/// Each circuit consists of ACIR bytecode, a name, and a verification key.
/// Circuits must be loaded in execution order (init, inner, reset, tail).
///
/// # Arguments
/// * `name` - Circuit name (e.g., "private_kernel_init")
/// * `bytecode` - Uncompressed ACIR circuit bytecode
/// * `verification_key` - Pre-computed verification key bytes
pub fn chonk_load(name: &str, bytecode: &[u8], verification_key: &[u8]) -> Result<(), String> {
    let circuit = CircuitInput {
        name: name.to_string(),
        bytecode: bytecode.to_vec(),
        verification_key: verification_key.to_vec(),
    };
    with_session(|api| {
        api.chonk_load(circuit)
            .map_err(|e| format!("chonk_load failed: {}", e))?;
        Ok(())
    })
}

/// Accumulate a witness for the most recently loaded circuit.
///
/// The witness must correspond to the circuit loaded by the preceding chonk_load call.
/// Each chonk_load must be followed by exactly one chonk_accumulate.
///
/// # Arguments
/// * `witness` - Serialized witness bytes
pub fn chonk_accumulate(witness: &[u8]) -> Result<(), String> {
    with_session(|api| {
        api.chonk_accumulate(witness)
            .map_err(|e| format!("chonk_accumulate failed: {}", e))?;
        Ok(())
    })
}

/// Generate the IVC proof from all accumulated circuits.
///
/// Returns a ChonkProveResponse containing the compound proof:
/// - mega_proof: Main IVC proof commitment polynomials
/// - goblin_proof: { merge_proof, eccvm_proof, ipa_proof, translator_proof }
///
/// After calling chonk_prove, the session remains open for verification or
/// additional operations. Call chonk_destroy to release resources.
pub fn chonk_prove() -> Result<ChonkProveResponse, String> {
    with_session(|api| {
        api.chonk_prove()
            .map_err(|e| format!("chonk_prove failed: {}", e))
    })
}

/// Verify a chonk proof against a verification key.
///
/// # Arguments
/// * `proof_response` - The ChonkProveResponse containing the ChonkProof
/// * `vk` - Verification key bytes
///
/// # Returns
/// * Whether the proof is valid
pub fn chonk_verify(proof_response: &ChonkProveResponse, vk: &[u8]) -> Result<bool, String> {
    with_session(|api| {
        let response = api
            .chonk_verify(proof_response.proof.clone(), vk)
            .map_err(|e| format!("chonk_verify failed: {}", e))?;
        Ok(response.valid)
    })
}

/// Compute verification key for a circuit (chonk variant).
///
/// # Arguments
/// * `bytecode` - Uncompressed ACIR circuit bytecode
///
/// # Returns
/// * ChonkComputeVkResponse containing bytes and field representation
pub fn chonk_compute_vk(bytecode: &[u8]) -> Result<ChonkComputeVkResponse, String> {
    let circuit = CircuitInputNoVK {
        name: String::new(),
        bytecode: bytecode.to_vec(),
    };
    with_session(|api| {
        api.chonk_compute_vk(circuit)
            .map_err(|e| format!("chonk_compute_vk failed: {}", e))
    })
}

/// Destroy the current chonk session and release resources.
///
/// Should be called after proving is complete to free the backend.
pub fn chonk_destroy() -> Result<(), String> {
    let mut session = CHONK_SESSION
        .lock()
        .map_err(|e| format!("Failed to lock chonk session: {}", e))?;
    if let Some(mut api) = session.take() {
        let _ = api.destroy();
    }
    Ok(())
}

/// High-level convenience: prove a full transaction in one call.
///
/// Takes a list of (name, bytecode, witness, vkey) tuples representing the
/// execution steps, and returns the serialized compound proof.
///
/// # Arguments
/// * `steps` - Ordered list of circuit execution steps
/// * `low_memory_mode` - Whether to use file-backed polynomial storage
/// * `max_storage_usage` - Optional storage budget in bytes
///
/// # Returns
/// * Serialized ChonkProof bytes (msgpack-encoded)
pub fn prove_transaction(
    steps: &[(&str, &[u8], &[u8], &[u8])], // (name, bytecode, witness, vkey)
    low_memory_mode: bool,
    max_storage_usage: Option<u64>,
) -> Result<ChonkProveResponse, String> {
    configure_memory(low_memory_mode, max_storage_usage);

    let num_circuits = steps.len() as u32;
    chonk_start(num_circuits)?;

    for (name, bytecode, witness, vkey) in steps {
        chonk_load(name, bytecode, vkey)?;
        chonk_accumulate(witness)?;
    }

    let proof = chonk_prove()?;
    Ok(proof)
}
