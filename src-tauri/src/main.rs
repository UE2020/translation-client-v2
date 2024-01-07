// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use sysinfo::{System, SystemExt};
mod inference;

pub struct ApplicationState {
    pipeline: Option<inference::TextGeneration>,
    sys: System,
}

impl ApplicationState {
    pub fn new() -> Self {
        Self {
            pipeline: None,
            sys: System::new_all(),
        }
    }

    pub fn set_pipeline(&mut self, pipeline: inference::TextGeneration) {
        self.pipeline = Some(pipeline);
    }
}

pub struct StateWrapper(Mutex<ApplicationState>);

#[tauri::command]
fn get_memory(state: tauri::State<'_, StateWrapper>) -> Result<u64, String> {
    let mut state = state.0.lock().unwrap();
    state.sys.refresh_memory();
    Ok(state.sys.available_memory())
}

fn main() {
    tauri::Builder::default()
        .manage(StateWrapper(Mutex::new(ApplicationState::new().into())))
        .invoke_handler(tauri::generate_handler![
            inference::load_model,
            inference::download_model,
            inference::create_translation_response,
            get_memory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
