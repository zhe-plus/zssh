use anyhow::{anyhow, Result};

#[cfg(windows)]
pub fn protect_string(plain: &str) -> Result<String> {
    use base64::Engine;
    use std::ffi::c_void;
    use windows::{
        core::PCWSTR,
        Win32::{
            Security::Cryptography::{
                CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
            },
            Foundation::{LocalFree, HLOCAL},
        },
    };

    let mut input = plain.as_bytes().to_vec();
    let mut in_blob = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_mut_ptr(),
    };

    let mut out_blob = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptProtectData(
            &mut in_blob,
            PCWSTR::null(),
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| anyhow!(e))?;
    };

    let bytes = unsafe { std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize) };
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    unsafe {
        if !out_blob.pbData.is_null() {
            LocalFree(HLOCAL(out_blob.pbData as *mut c_void));
        }
    }
    Ok(encoded)
}

#[cfg(windows)]
pub fn unprotect_string(cipher_b64: &str) -> Result<String> {
    use base64::Engine;
    use std::ffi::c_void;
    use windows::{
        Win32::{
            Security::Cryptography::{
                CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
            },
            Foundation::{LocalFree, HLOCAL},
        },
    };

    let mut cipher = base64::engine::general_purpose::STANDARD
        .decode(cipher_b64)
        .map_err(|e| anyhow!(e))?;

    let mut in_blob = CRYPT_INTEGER_BLOB {
        cbData: cipher.len() as u32,
        pbData: cipher.as_mut_ptr(),
    };

    let mut out_blob = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptUnprotectData(
            &mut in_blob,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| anyhow!(e))?;
    };

    let bytes = unsafe { std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize) };
    let s = String::from_utf8_lossy(bytes).to_string();
    unsafe {
        if !out_blob.pbData.is_null() {
            LocalFree(HLOCAL(out_blob.pbData as *mut c_void));
        }
    }
    Ok(s)
}

#[cfg(not(windows))]
pub fn protect_string(_plain: &str) -> Result<String> {
    Err(anyhow!("DPAPI only supported on Windows"))
}

#[cfg(not(windows))]
pub fn unprotect_string(_cipher_b64: &str) -> Result<String> {
    Err(anyhow!("DPAPI only supported on Windows"))
}
