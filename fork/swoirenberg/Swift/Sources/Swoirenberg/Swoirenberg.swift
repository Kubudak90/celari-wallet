import Foundation
import SwoirCore

public class Swoirenberg: SwoirBackendProtocol {

    public static func setup_srs(circuit_size: UInt32, srs_path: String? = nil) throws -> UInt32 {
        if circuit_size == 0 { throw SwoirBackendError.nonPositiveCircuitSize }
        guard let result = setup_srs_swift(circuit_size, srs_path) else {
            throw SwoirBackendError.errorSettingUpSRS
        }
        return result
    }

    public static func setup_srs_from_bytecode(bytecode: Data, srs_path: String? = nil) throws -> UInt32 {
        if bytecode.isEmpty { throw SwoirBackendError.emptyBytecode }
        let bytecodeBase64 = bytecode.base64EncodedString()
        guard let result = setup_srs_from_bytecode_swift(bytecodeBase64, srs_path) else {
            throw SwoirBackendError.errorSettingUpSRS
        }
        return result
    }

    public static func prove(bytecode: Data, witnessMap: [String], proof_type: String, vkey: Data, low_memory_mode: Bool? = false, storage_cap: UInt64? = nil) throws -> Data {
        if bytecode.isEmpty { throw SwoirBackendError.emptyBytecode }
        if witnessMap.isEmpty { throw SwoirBackendError.emptyWitnessMap }
        let bytecodeBase64 = bytecode.base64EncodedString()
        let witnessMapRustVec = RustVec<RustString>.init()
        for witness in witnessMap {
            witnessMapRustVec.push(value: witness.intoRustString())
        }

        guard let proofResult = prove_swift(bytecodeBase64.intoRustString(), witnessMapRustVec, proof_type.intoRustString(), RustVec<UInt8>(from: vkey), low_memory_mode ?? false, storage_cap ?? 0) else {
            throw SwoirBackendError.errorProving("Error generating proof")
        }
        return Data(proofResult)
    }

    public static func verify(proof: Data, vkey: Data, proof_type: String) throws -> Bool {
        if proof.isEmpty { throw SwoirBackendError.emptyProofData }
        if vkey.isEmpty { throw SwoirBackendError.emptyVerificationKey }

        let verified = verify_swift(RustVec<UInt8>(from: proof), RustVec<UInt8>(from: vkey), proof_type) ?? false
        return verified
    }

    public static func execute(bytecode: Data, witnessMap: [String]) throws -> [String] {
        if bytecode.isEmpty { throw SwoirBackendError.emptyBytecode }
        if witnessMap.isEmpty { throw SwoirBackendError.emptyWitnessMap }
        let bytecodeBase64 = bytecode.base64EncodedString()
        let witnessMapRustVec = RustVec<RustString>.init()
        for witness in witnessMap {
            witnessMapRustVec.push(value: witness.intoRustString())
        }

        guard let witnessResult = execute_swift(bytecodeBase64.intoRustString(), witnessMapRustVec) else {
            throw SwoirBackendError.errorExecuting("Error executing circuit")
        }
        return witnessResult.map { $0.as_str().toString() }
    }

    public static func get_verification_key(bytecode: Data, proof_type: String, low_memory_mode: Bool? = false, storage_cap: UInt64? = nil) throws -> Data {
        if bytecode.isEmpty { throw SwoirBackendError.emptyBytecode }
        let bytecodeBase64 = bytecode.base64EncodedString()
        guard let result = get_vkey_swift(bytecodeBase64.intoRustString(), proof_type.intoRustString(), low_memory_mode ?? false, storage_cap ?? 0) else {
            throw SwoirBackendError.errorGettingVerificationKey
        }
        return Data(result)
    }

    // MARK: - Grumpkin SRS

    public static func setup_grumpkin_srs(num_points: UInt32, srs_path: String? = nil) throws -> UInt32 {
        guard let result = setup_grumpkin_srs_swift(num_points, srs_path) else {
            throw SwoirBackendError.errorSettingUpSRS
        }
        return result
    }

    // MARK: - Raw SRS Init (direct bytes, no file I/O)

    public static func setup_srs_raw(g1_data: Data, num_points: UInt32) throws {
        let error = setup_srs_raw_swift(RustVec<UInt8>(from: g1_data), num_points).toString()
        if !error.isEmpty {
            throw SwoirBackendError.errorProving("BN254 SRS: \(error)")
        }
    }

    public static func setup_grumpkin_srs_raw(g1_data: Data, num_points: UInt32) throws {
        let error = setup_grumpkin_srs_raw_swift(RustVec<UInt8>(from: g1_data), num_points).toString()
        if !error.isEmpty {
            throw SwoirBackendError.errorProving("Grumpkin SRS: \(error)")
        }
    }

    // MARK: - Chonk/IVC Pipeline

    public static func chonk_start(num_circuits: UInt32) throws -> Bool {
        guard let result = chonk_start_swift(num_circuits) else {
            throw SwoirBackendError.errorProving("chonk_start failed")
        }
        return result
    }

    public static func chonk_load(name: String, bytecode: Data, verification_key: Data) throws -> Bool {
        guard let result = chonk_load_swift(
            name.intoRustString(),
            RustVec<UInt8>(from: bytecode),
            RustVec<UInt8>(from: verification_key)
        ) else {
            throw SwoirBackendError.errorProving("chonk_load failed for \(name)")
        }
        return result
    }

    public static func chonk_accumulate(witness: Data) throws -> Bool {
        guard let result = chonk_accumulate_swift(RustVec<UInt8>(from: witness)) else {
            throw SwoirBackendError.errorProving("chonk_accumulate failed")
        }
        return result
    }

    public static func chonk_prove() throws -> Data? {
        guard let result = chonk_prove_swift() else { return nil }
        return Data(result)
    }

    public static func chonk_verify(proof: Data, vk: Data) throws -> Bool {
        return chonk_verify_swift(RustVec<UInt8>(from: proof), RustVec<UInt8>(from: vk)) ?? false
    }

    public static func chonk_compute_vk(bytecode: Data) throws -> Data? {
        guard let result = chonk_compute_vk_swift(RustVec<UInt8>(from: bytecode)) else { return nil }
        return Data(result)
    }

    public static func chonk_destroy() throws -> Bool {
        return chonk_destroy_swift() ?? false
    }

    public static func chonk_prove_transaction(
        names: [String],
        bytecodes: [Data],
        witnesses: [Data],
        vkeys: [Data],
        low_memory_mode: Bool = false,
        storage_cap: UInt64 = 0
    ) throws -> Data? {
        // Encode steps as JSON for FFI (swift-bridge doesn't support Vec<Vec<u8>>)
        let steps: [[String: String]] = zip(zip(names, bytecodes), zip(witnesses, vkeys)).map { pair in
            [
                "name": pair.0.0,
                "bytecode": pair.0.1.base64EncodedString(),
                "witness": pair.1.0.base64EncodedString(),
                "vkey": pair.1.1.base64EncodedString()
            ]
        }
        let jsonData = try JSONSerialization.data(withJSONObject: steps)
        let jsonString = String(data: jsonData, encoding: .utf8) ?? "[]"

        guard let result = chonk_prove_transaction_swift(
            jsonString.intoRustString(),
            low_memory_mode,
            storage_cap
        ) else { return nil }
        return Data(result)
    }
}