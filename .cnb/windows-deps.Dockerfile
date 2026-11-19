ARG WINDOWS_TOOLCHAIN_IMAGE
FROM ${WINDOWS_TOOLCHAIN_IMAGE}

WORKDIR /opt/gasoline/dependency-manifest
COPY desktop/src-tauri/Cargo.toml desktop/src-tauri/Cargo.lock ./

# Cargo needs a target to parse the application manifest when only the dependency files are copied.
RUN mkdir src \
 && printf 'fn main() {}\n' > src/main.rs \
 && printf 'fn main() {}\n' > build.rs \
 && cargo fetch --locked \
 && du -sh "$CARGO_HOME/registry"

WORKDIR /workspace
