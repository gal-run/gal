FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
COPY governance-svc/internal/gal/ governance-svc/internal/gal/
COPY gal-inference-svc/ gal-inference-svc/
RUN CGO_ENABLED=0 go build -o /gal-inference-svc ./gal-inference-svc/cmd/server/

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /gal-inference-svc /gal-inference-svc
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/gal-inference-svc"]
