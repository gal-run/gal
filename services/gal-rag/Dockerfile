FROM golang:1.25.0-alpine AS builder

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || true

COPY . .
RUN CGO_ENABLED=0 go build -o /server ./gal-rag/cmd/server/

FROM gcr.io/distroless/static:nonroot

COPY --from=builder /server /server

ENTRYPOINT ["/server"]
EXPOSE 8080
