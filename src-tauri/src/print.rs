
// ============================================================
//  Smart Tech PDV — Silent Print (Windows) for Tauri v2 (Enhanced)
//  Adds:
//   - optional printer_name (Sumatra -print-to "NAME")
//   - copies support (Sumatra -print-settings "copies=2")
//
//  Pipeline:
//   HTML -> PDF (Edge headless) -> Sumatra silent print
// ============================================================

use std::{fs, path::PathBuf, process::Command, time::{SystemTime, UNIX_EPOCH}};

use tauri::{AppHandle, Runtime, Manager};

#[derive(serde::Deserialize)]
pub struct SilentPrintArgs {
  pub html: String,
  pub job_name: Option<String>,
  pub printer_name: Option<String>,
  pub copies: Option<u32>,
}

fn uniq() -> u128 {
  SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}

fn write_temp_file(ext: &str, content: &str) -> Result<PathBuf, String> {
  let mut p = std::env::temp_dir();
  p.push(format!("stpdv_print_{}.{}", uniq(), ext));
  fs::write(&p, content).map_err(|e| format!("temp write failed: {e}"))?;
  Ok(p)
}

fn try_edge_paths() -> Vec<String> {
  vec![
    "msedge.exe".to_string(),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe".to_string(),
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe".to_string(),
  ]
}

fn run_edge_print_to_pdf(edge: &str, html_path: &PathBuf, pdf_path: &PathBuf) -> Result<(), String> {
  let file_url = format!("file:///{}", html_path.to_string_lossy().replace('\\', "/"));

  let out = Command::new(edge)
    .arg("--headless")
    .arg("--disable-gpu")
    .arg("--no-first-run")
    .arg("--no-default-browser-check")
    .arg(format!("--print-to-pdf={}", pdf_path.to_string_lossy()))
    .arg(file_url)
    .output();

  match out {
    Ok(o) if o.status.success() => Ok(()),
    Ok(o) => Err(format!(
      "Edge failed ({edge}). status={:?}, stderr={}",
      o.status.code(),
      String::from_utf8_lossy(&o.stderr)
    )),
    Err(e) => Err(format!("Edge spawn failed ({edge}): {e}")),
  }
}

fn resolve_sumatra<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  use tauri::path::BaseDirectory;

  let p = app
    .path()
    .resolve("SumatraPDF.exe", BaseDirectory::Resource)
    .map_err(|e| format!("resolve SumatraPDF resource failed: {e}"))?;

  if !p.exists() {
    return Err(format!(
      "SumatraPDF.exe not found in resources. Expected: {}",
      p.to_string_lossy()
    ));
  }
  Ok(p)
}

fn sumatra_silent_print(
  sumatra: &PathBuf,
  pdf_path: &PathBuf,
  printer_name: Option<&str>,
  copies: u32,
) -> Result<(), String> {
  let mut cmd = Command::new(sumatra);
  cmd.arg("-silent");

  if let Some(p) = printer_name {
    cmd.arg("-print-to").arg(p);
  } else {
    cmd.arg("-print-to-default");
  }

  // Sumatra print settings (portable) supports: copies=, duplex=, etc.
  // We keep it simple and safe: copies only.
  if copies > 1 {
    cmd.arg("-print-settings").arg(format!("copies={}", copies));
  }

  cmd.arg(pdf_path);

  let out = cmd.output().map_err(|e| format!("Sumatra spawn failed: {e}"))?;
  if out.status.success() {
    Ok(())
  } else {
    Err(format!(
      "Sumatra print failed. status={:?}, stderr={}",
      out.status.code(),
      String::from_utf8_lossy(&out.stderr)
    ))
  }
}

#[tauri::command]
pub async fn silent_print_html<R: Runtime>(app: AppHandle<R>, args: SilentPrintArgs) -> Result<(), String> {
  let html_path = write_temp_file("html", &args.html)?;

  let mut pdf_path = std::env::temp_dir();
  pdf_path.push(format!("stpdv_print_{}.pdf", uniq()));

  let mut last_err: Option<String> = None;
  let mut ok = false;

  for edge in try_edge_paths() {
    match run_edge_print_to_pdf(&edge, &html_path, &pdf_path) {
      Ok(_) => { ok = true; break; }
      Err(e) => last_err = Some(e),
    }
  }

  if !ok {
    return Err(last_err.unwrap_or("Edge not available".to_string()));
  }

  let sumatra = resolve_sumatra(&app)?;
  let copies = args.copies.unwrap_or(1).max(1);
  sumatra_silent_print(
    &sumatra,
    &pdf_path,
    args.printer_name.as_deref(),
    copies
  )?;

  let _ = fs::remove_file(&html_path);
  let _ = fs::remove_file(&pdf_path);

  Ok(())
}
