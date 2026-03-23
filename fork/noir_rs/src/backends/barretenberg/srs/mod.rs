pub mod localsrs;
pub mod netsrs;
use serde::{Deserialize, Serialize};

use crate::backends::barretenberg::api;
use crate::backends::barretenberg::utils::{get_circuit_size, compute_subgroup_size};

// G2 is a small fixed group, so we can hardcode it here
const G2: [u8; 128] = [1, 24, 196, 213, 184, 55, 188, 194, 188, 137, 181, 179, 152, 181, 151, 78, 159, 89, 68, 7, 59, 50, 7, 139, 126, 35, 31, 236, 147, 136, 131, 176, 38, 14, 1, 178, 81, 246, 241, 199, 231, 255, 78, 88, 7, 145, 222, 232, 234, 81, 216, 122, 53, 142, 3, 139, 78, 254, 48, 250, 192, 147, 131, 193, 34, 254, 189, 163, 192, 192, 99, 42, 86, 71, 91, 66, 20, 229, 97, 94, 17, 230, 221, 63, 150, 230, 206, 162, 133, 74, 135, 212, 218, 204, 94, 85, 4, 252, 99, 105, 247, 17, 15, 227, 210, 81, 86, 193, 187, 154, 114, 133, 156, 242, 160, 70, 65, 249, 155, 164, 238, 65, 60, 128, 218, 106, 95, 228];

#[derive(Serialize, Deserialize, PartialEq, Debug)]
pub struct Srs {
    pub g1_data: Vec<u8>,
    pub g2_data: Vec<u8>,
    pub num_points: u32,
}

impl Srs {
    pub fn get(self, num_points: u32) -> Srs {
        match self.num_points.cmp(&num_points) {
            std::cmp::Ordering::Equal => self,
            _ => Srs {
                g1_data: self.g1_data[..=(num_points * 64 - 1) as usize].to_vec(),
                g2_data: self.g2_data,
                num_points,
            },
        }
    }
}


pub fn get_srs(subgroup_size: u32, srs_path: Option<&str>) -> Srs {
    match srs_path {
        Some(path) => {
            if path.ends_with(".dat") {
                // Interpret as a .dat file
                let local_srs = localsrs::LocalSrs::from_dat_file(subgroup_size + 1, srs_path);
                local_srs.to_srs()
            } else {
                // Otherwise interpret as a .local file (i.e. a serialized SRS struct)
                let local_srs = localsrs::LocalSrs::new(subgroup_size + 1, srs_path);
                local_srs.to_srs()
            }
        }
        None => {
            let net_srs = netsrs::NetSrs::new(subgroup_size + 1);
            net_srs.to_srs()
        }
    }
}

/// Direct SRS init from raw G1/G2 bytes — no file I/O, no unwrap().
pub fn setup_srs_from_raw(g1_data: &[u8], num_points: u32, g2_data: &[u8]) -> Result<u32, String> {
    api::srs_init(g1_data, num_points, g2_data)?;
    Ok(num_points)
}

pub fn setup_srs(circuit_size: u32, srs_path: Option<&str>) -> Result<u32, String> {
    let subgroup_size = compute_subgroup_size(circuit_size);
    let srs = get_srs(subgroup_size, srs_path);

    api::srs_init(&srs.g1_data, srs.num_points, &srs.g2_data)?;

    Ok(srs.num_points)
}

pub fn setup_srs_from_bytecode(circuit_bytecode: &str, srs_path: Option<&str>, recursive: bool) -> Result<u32, String> {
    let circuit_size = get_circuit_size(circuit_bytecode, recursive);
    setup_srs(circuit_size, srs_path)
}

/// Grumpkin SRS data container.
#[derive(Serialize, Deserialize, PartialEq, Debug)]
pub struct GrumpkinSrs {
    pub g1_data: Vec<u8>,
    pub num_points: u32,
}

/// Default Grumpkin SRS size for IVC proving: 2^16 + 1 = 65537 points.
pub const GRUMPKIN_SRS_SIZE: u32 = 65537;

/// Set up Grumpkin SRS for chonk/IVC proving.
///
/// Grumpkin curve SRS is required for the recursive verification components
/// (ECCVM and IPA) in the IVC proof pipeline. Unlike BN254 SRS which scales
/// with circuit size, Grumpkin SRS is a fixed size.
///
/// # Arguments
/// * `num_points` - Number of G1 points (default: 65537)
/// * `srs_path` - Path to cached SRS directory. If None, downloads from network.
pub fn setup_grumpkin_srs(num_points: u32, srs_path: Option<&str>) -> Result<u32, String> {
    let grumpkin_srs = get_grumpkin_srs(num_points, srs_path)?;
    api::srs_init_grumpkin(&grumpkin_srs.g1_data, grumpkin_srs.num_points)?;
    Ok(grumpkin_srs.num_points)
}

/// Load Grumpkin SRS from local file or download from network.
fn get_grumpkin_srs(num_points: u32, srs_path: Option<&str>) -> Result<GrumpkinSrs, String> {
    match srs_path {
        Some(path) => {
            let grumpkin_path = format!("{}/grumpkin_g1.dat", path);
            let g1_data = std::fs::read(&grumpkin_path)
                .map_err(|e| format!("Failed to read Grumpkin SRS from {}: {}", grumpkin_path, e))?;
            let expected_len = (num_points as usize) * 64;
            let actual_data = if g1_data.len() >= expected_len {
                g1_data[..expected_len].to_vec()
            } else {
                return Err(format!(
                    "Grumpkin SRS file too small: expected {} bytes for {} points, got {}",
                    expected_len, num_points, g1_data.len()
                ));
            };
            Ok(GrumpkinSrs {
                g1_data: actual_data,
                num_points,
            })
        }
        None => {
            // Download from Aztec's CRS endpoint
            let url = format!(
                "https://crs.aztec-cdn.foundation/grumpkin_g1.dat"
            );
            let response = reqwest::blocking::get(&url)
                .map_err(|e| format!("Failed to download Grumpkin SRS: {}", e))?;
            let g1_data = response
                .bytes()
                .map_err(|e| format!("Failed to read Grumpkin SRS response: {}", e))?;
            let expected_len = (num_points as usize) * 64;
            let actual_data = if g1_data.len() >= expected_len {
                g1_data[..expected_len].to_vec()
            } else {
                return Err(format!(
                    "Downloaded Grumpkin SRS too small: expected {} bytes, got {}",
                    expected_len,
                    g1_data.len()
                ));
            };
            Ok(GrumpkinSrs {
                g1_data: actual_data,
                num_points,
            })
        }
    }
}
