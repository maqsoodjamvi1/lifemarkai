FROM rust:1.83-bookworm AS build
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/lifemark-ast /usr/local/bin/lifemark-ast
ENV PORT=8765
EXPOSE 8765
CMD ["lifemark-ast"]
