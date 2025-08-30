# ---- Build stage (Debian base)
FROM golang:1.22 AS builder
WORKDIR /app

ENV GOPROXY=https://proxy.golang.org,direct \
    GOSUMDB=sum.golang.org

# 1) Copy only go.mod first so we can pre-warm modules
COPY go.mod ./

# 2) Download what go.mod declares (ok if no go.sum yet)
RUN go mod download

# 3) Now copy the rest of the source
COPY . .

# 4) Tidy to create/update go.sum inside the container
RUN go mod tidy

# 5) Build static binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o server

# ---- Runtime (distroless)
FROM gcr.io/distroless/base-debian12
WORKDIR /app
COPY --from=builder /app/server ./server
EXPOSE 8080
USER nonroot:nonroot
ENV API_PORT=8080
CMD ["./server"]
