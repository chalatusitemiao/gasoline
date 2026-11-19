FROM node:24-trixie

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

ENV CARGO_HOME=/opt/gasoline/cargo
ENV RUSTUP_HOME=/opt/gasoline/rustup
ENV XWIN_ARCH=x86_64
ENV XWIN_CACHE_DIR=/opt/gasoline/windows-sdk
ENV PATH=/usr/lib/llvm-19/bin:/opt/gasoline/cargo/bin:${PATH}

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential ca-certificates clang-19 clang-tools-19 cmake curl lld-19 llvm-19 \
    nasm ninja-build nsis pkg-config zip \
 && makensis -VERSION \
 && test -f /usr/share/nsis/Include/Win/RestartManager.nsh \
 && apt-get clean \
 && find /var/lib/apt/lists -mindepth 1 -delete

RUN curl --proto '=https' --tlsv1.2 -fsSL --retry 3 https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain stable --no-modify-path \
      --target x86_64-pc-windows-msvc

RUN tools_dir=$(mktemp -d) \
 && trap 'rm -rf -- "$tools_dir"' EXIT \
 && curl --proto '=https' --tlsv1.2 -fsSL --retry 3 \
    https://github.com/rust-cross/cargo-xwin/releases/download/v0.23.1/cargo-xwin-v0.23.1.x86_64-unknown-linux-musl.tar.gz \
    -o "$tools_dir/cargo-xwin.tar.gz" \
 && printf '%s  %s\n' c492c6dfb7e5ac0eee586b796e0fc950ba13077e7f0bbb046f445d71790d5360 "$tools_dir/cargo-xwin.tar.gz" \
    | sha256sum --check \
 && tar -xzf "$tools_dir/cargo-xwin.tar.gz" -C "$tools_dir" \
 && install -m 755 "$tools_dir/cargo-xwin" /usr/local/bin/cargo-xwin \
 && npm install --global pnpm@11.5.0

# Keep the cold cache build observable while cargo-xwin downloads the Windows SDK.
RUN mkdir -p "$XWIN_CACHE_DIR"; \
    (while sleep 30; do \
      sdk_size=$(du -sh "$XWIN_CACHE_DIR" | cut -f1); \
      printf 'Windows SDK 下载及解包进行中，缓存：%s\n' "$sdk_size"; \
    done) & \
    heartbeat_pid=$!; \
    trap 'kill "$heartbeat_pid" 2>/dev/null || true' EXIT; \
    cargo xwin cache xwin; \
    test -s "$XWIN_CACHE_DIR/xwin/DONE"; \
    du -sh "$XWIN_CACHE_DIR"
