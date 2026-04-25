// Core/DataHexExtension.swift
//
// Lifted from V1 Views/Recovery/GuardianSetupView.swift during V1 cleanup
// because PXENativeProver.swift consumes Data(hexString:). Belongs in
// Core/ as a generic utility, not bundled into a view file.

import Foundation

extension Data {
    init(hexString: String) {
        let hex = hexString.hasPrefix("0x") ? String(hexString.dropFirst(2)) : hexString
        var data = Data()
        var index = hex.startIndex
        while index < hex.endIndex {
            let nextIndex = hex.index(index, offsetBy: 2, limitedBy: hex.endIndex) ?? hex.endIndex
            if let byte = UInt8(hex[index..<nextIndex], radix: 16) {
                data.append(byte)
            }
            index = nextIndex
        }
        self = data
    }
}
