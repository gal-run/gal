FROM golang:1.25-alpine AS builder

WORKDIR /app

# Cache module downloads in a separate layer.
COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || true

COPY . .
RUN CGO_ENABLED=0 go build -o /server ./team-svc/cmd/server/

# Build a minimal statically-linked healthcheck binary.
RUN mkdir -p /tmp/hc && \
    cat > /tmp/hc/main.go <<-'GOEOF'
package main

import (
	"io"
	"net/http"
	"os"
)

func main() {
	resp, err := http.Get("http://127.0.0.1:8080/health")
	if err != nil {
		os.Exit(1)
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		os.Exit(1)
	}
}
GOEOF
RUN CGO_ENABLED=0 go build -o /healthcheck /tmp/hc/main.go

FROM gcr.io/distroless/static:nonroot

COPY --from=builder /server /server
COPY --from=builder /healthcheck /healthcheck


ENTRYPOINT ["/server"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/healthcheck"]
