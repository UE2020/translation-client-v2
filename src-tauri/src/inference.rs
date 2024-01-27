use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Error as E, Result};

use candle_transformers::models::mistral::{Config, Model as Mistral};
use candle_transformers::models::quantized_mistral::Model as QMistral;

use candle::{DType, Device, Tensor};
use candle_core as candle;
use candle_transformers::generation::LogitsProcessor;
use hf_hub::{api::sync::Api, Repo, RepoType};
use tokenizers::Tokenizer;

use crate::StateWrapper;

/// This is a wrapper around a tokenizer to ensure that tokens can be returned to the user in a
/// streaming way rather than having to wait for the full decoding.
pub struct TokenOutputStream {
    tokenizer: tokenizers::Tokenizer,
    tokens: Vec<u32>,
    prev_index: usize,
    current_index: usize,
}

impl TokenOutputStream {
    pub fn new(tokenizer: tokenizers::Tokenizer) -> Self {
        Self {
            tokenizer,
            tokens: Vec::new(),
            prev_index: 0,
            current_index: 0,
        }
    }

    #[allow(unused)]
    pub fn into_inner(self) -> tokenizers::Tokenizer {
        self.tokenizer
    }

    fn decode(&self, tokens: &[u32]) -> Result<String> {
        match self.tokenizer.decode(tokens, true) {
            Ok(str) => Ok(str),
            Err(err) => anyhow::bail!("cannot decode: {err}"),
        }
    }

    // https://github.com/huggingface/text-generation-inference/blob/5ba53d44a18983a4de32d122f4cb46f4a17d9ef6/server/text_generation_server/models/model.py#L68
    pub fn next_token(&mut self, token: u32) -> Result<Option<String>> {
        let prev_text = if self.tokens.is_empty() {
            String::new()
        } else {
            let tokens = &self.tokens[self.prev_index..self.current_index];
            self.decode(tokens)?
        };
        self.tokens.push(token);
        let text = self.decode(&self.tokens[self.prev_index..])?;
        if text.len() > prev_text.len() && text.chars().last().unwrap().is_ascii() {
            let text = text.split_at(prev_text.len());
            self.prev_index = self.current_index;
            self.current_index = self.tokens.len();
            Ok(Some(text.1.to_string()))
        } else {
            Ok(None)
        }
    }

    pub fn decode_rest(&self) -> Result<Option<String>> {
        let prev_text = if self.tokens.is_empty() {
            String::new()
        } else {
            let tokens = &self.tokens[self.prev_index..self.current_index];
            self.decode(tokens)?
        };
        let text = self.decode(&self.tokens[self.prev_index..])?;
        if text.len() > prev_text.len() {
            let text = text.split_at(prev_text.len());
            Ok(Some(text.1.to_string()))
        } else {
            Ok(None)
        }
    }

    #[allow(unused)]
    pub fn decode_all(&self) -> Result<String> {
        self.decode(&self.tokens)
    }

    pub fn get_token(&self, token_s: &str) -> Option<u32> {
        self.tokenizer.get_vocab(true).get(token_s).copied()
    }

    pub fn tokenizer(&self) -> &tokenizers::Tokenizer {
        &self.tokenizer
    }

    pub fn clear(&mut self) {
        self.tokens.clear();
        self.prev_index = 0;
        self.current_index = 0;
    }
}

#[derive(Clone)]
enum Model {
    #[allow(unused)]
    Mistral(Mistral),
    Quantized(QMistral),
}

pub struct TextGeneration {
    model: Model,
    device: Device,
    tokenizer: TokenOutputStream,
    logits_processor: LogitsProcessor,
    repeat_penalty: f32,
    repeat_last_n: usize,
}

impl TextGeneration {
    #[allow(clippy::too_many_arguments)]
    fn new(
        model: Model,
        tokenizer: Tokenizer,
        seed: u64,
        temp: Option<f64>,
        top_p: Option<f64>,
        repeat_penalty: f32,
        repeat_last_n: usize,
        device: &Device,
    ) -> Self {
        let logits_processor = LogitsProcessor::new(seed, temp, top_p);
        Self {
            model,
            tokenizer: TokenOutputStream::new(tokenizer),
            logits_processor,
            repeat_penalty,
            repeat_last_n,
            device: device.clone(),
        }
    }

    fn run(&mut self, prompt: &str, sample_len: usize) -> Result<String> {
        let old_model = self.model.clone();
        let mut output_tokens = String::new();
        self.tokenizer.clear();
        let mut tokens = self
            .tokenizer
            .tokenizer()
            .encode(prompt, true)
            .map_err(E::msg)?
            .get_ids()
            .to_vec();
        if tokens.len() > (140 * 3) {
            return Ok(String::new());
        }
        let mut generated_tokens = 0usize;
        let eos_token = match self.tokenizer.get_token("</s>") {
            Some(token) => token,
            None => anyhow::bail!("cannot find the </s> token"),
        };
        let start_gen = std::time::Instant::now();
        for index in 0..sample_len {
            let context_size = if index > 0 { 1 } else { tokens.len() };
            let start_pos = tokens.len().saturating_sub(context_size);
            let ctxt = &tokens[start_pos..];
            let input = Tensor::new(ctxt, &self.device)?.unsqueeze(0)?;
            let logits = match &mut self.model {
                Model::Mistral(m) => m.forward(&input, start_pos)?,
                Model::Quantized(m) => m.forward(&input, start_pos)?,
            };
            let logits = logits.squeeze(0)?.squeeze(0)?.to_dtype(DType::F32)?;
            let logits = if self.repeat_penalty == 1. {
                logits
            } else {
                let start_at = tokens.len().saturating_sub(self.repeat_last_n);
                candle_transformers::utils::apply_repeat_penalty(
                    &logits,
                    self.repeat_penalty,
                    &tokens[start_at..],
                )?
            };

            let next_token = self.logits_processor.sample(&logits)?;
            tokens.push(next_token);
            generated_tokens += 1;
            if next_token == eos_token {
                break;
            }
            if let Some(t) = self.tokenizer.next_token(next_token)? {
                if t == "\n" {
                    break;
                }
                output_tokens.push_str(&t);
            }
        }
        let dt = start_gen.elapsed();
        if let Some(rest) = self.tokenizer.decode_rest().map_err(E::msg)? {
            output_tokens.push_str(&rest);
        }
        println!(
            "\n{generated_tokens} tokens generated ({:.2} token/s)",
            generated_tokens as f64 / dt.as_secs_f64(),
        );
        self.model = old_model;
        Ok(output_tokens)
    }
}

#[tauri::command]
pub async fn load_model(
    state: tauri::State<'_, StateWrapper>,
    model_location: String,
) -> Result<f64, String> {
    println!(
        "avx: {}, neon: {}, simd128: {}, f16c: {}",
        candle::utils::with_avx(),
        candle::utils::with_neon(),
        candle::utils::with_simd128(),
        candle::utils::with_f16c()
    );
    let start = std::time::Instant::now();
    let api = Api::new().map_err(|e| e.to_string())?;
    let repo = api.repo(Repo::with_revision(
        String::from("lmz/candle-mistral"),
        RepoType::Model,
        String::from("main"),
    ));
    let tokenizer = Tokenizer::from_file(repo.get("tokenizer.json").map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let config = Config::config_7b_v0_1(false);
    let vb = candle_transformers::quantized_var_builder::VarBuilder::from_gguf(model_location)
        .map_err(|e| e.to_string())?;
    let model = QMistral::new(&config, vb).map_err(|e| e.to_string())?;
    let model = Model::Quantized(model);
    let device = Device::Cpu;
    let pipeline = TextGeneration::new(model, tokenizer, 299792458, None, None, 1.1, 64, &device);
    state.0.lock().unwrap().set_pipeline(pipeline);
    Ok(start.elapsed().as_secs_f64())
}

#[tauri::command]
pub async fn create_translation_response(
    state: tauri::State<'_, StateWrapper>,
    input_string: String,
) -> Result<[String; 2], String> {
    let mut state = state.0.lock().unwrap();
    let translation = state.pipeline
        .as_mut()
        .expect("pipeline should be initialized")
        .run(&format!("Example Latin: Puer canem vult.\nEnglish translation: The boy wants a dog.\n\nLatin: {}\nEnglish translation:", input_string.trim()), 140 * 3)
        .map_err(|e| e.to_string())?;
    use ring::digest;
    use urlencoding::encode;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let translation = translation.trim();
    let message = format!("response={}&time={}&nonce=", encode(translation), now);
    let mut nonce = 0;
    loop {
        let test = message.clone() + &nonce.to_string();
        let digest = digest::digest(&digest::SHA256, test.as_bytes());
        let digest = digest.as_ref();
        let first_24_bits =
            ((digest[0] as i32) << 16) | ((digest[1] as i32) << 8) | digest[2] as i32;
        if first_24_bits == 0 || (first_24_bits << 8).leading_zeros() >= 20 {
            break Ok([test, translation.to_owned()]);
        }
        nonce += 1;
    }
}

#[tauri::command]
pub async fn translate_sentence(state: tauri::State<'_, StateWrapper>, input_string: String) -> Result<String, ()> {
    let mut state = state.0.lock().unwrap();
    let translation = state.pipeline
        .as_mut()
        .expect("pipeline should be initialized")
        .run(&format!("Example Latin: Puer canem vult.\nEnglish translation: The boy wants a dog.\n\nLatin: {}\nEnglish translation:", input_string.trim()), usize::MAX)
        .map_err(|e| e.to_string()).unwrap();
    Ok(translation.trim().to_string())
}

use futures_util::StreamExt;
use std::cmp::min;
use std::fs::{create_dir, File};
use std::io::{Seek, SeekFrom, Write};

#[tauri::command]
pub async fn download_model(window: tauri::Window) -> Result<PathBuf, String> {
    let res = reqwest::get(
        "https://huggingface.co/lmz/candle-mistral/resolve/main/model-q4k.gguf?download=true",
    )
    .await
    .map_err(|e| e.to_string())?;
    let total_size = res
        .content_length()
        .ok_or(String::from("Failed to get model content length"))?;
    let mut cache_dir = dirs::data_local_dir().ok_or(String::from(
        "Failed to get system cache directory: not found",
    ))?;
    cache_dir.push("translation-client");
    create_dir(&cache_dir).ok();
    cache_dir.push("model-q4k.gguf");
    if let Ok(mut file) = File::open(&cache_dir).map_err(|e| e.to_string()) {
        file.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
        if let Ok(len) = file.stream_position() {
            if len >= total_size {
                return Ok(cache_dir);
            }
        };
    }
    let mut file = File::create(&cache_dir).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();
    window
        .emit("starting-download", &cache_dir)
        .map_err(|e| e.to_string())?;
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        let new = min(downloaded + (chunk.len() as u64), total_size);
        downloaded = new;
        window
            .emit("download-progress", [downloaded, total_size])
            .map_err(|e| e.to_string())?;
    }
    Ok(cache_dir)
}
