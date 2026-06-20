module github.com/gal-run/gal/services

go 1.25.0

require (
	cloud.google.com/go/firestore v1.18.0
	firebase.google.com/go/v4 v4.15.0
	github.com/alecthomas/chroma/v2 v2.26.1
	github.com/crewjam/saml v0.5.1
	github.com/go-chi/chi/v5 v5.2.1
	github.com/go-chi/cors v1.2.1
	github.com/go-chi/httprate v0.14.1
	github.com/go-chi/jwtauth/v5 v5.4.0
	github.com/golang-jwt/jwt/v5 v5.2.2
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.9.2
	github.com/lestrrat-go/jwx/v3 v3.0.2
	github.com/prometheus/client_golang v1.23.2
	github.com/spf13/cobra v1.10.2
	github.com/testcontainers/testcontainers-go v0.33.0
	go.opentelemetry.io/otel v1.43.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.43.0
	go.opentelemetry.io/otel/sdk v1.43.0
	golang.org/x/time v0.9.0
)

require (
	cloud.google.com/go v0.117.0 // indirect
	cloud.google.com/go/auth v0.14.1 // indirect
	cloud.google.com/go/auth/oauth2adapt v0.2.7 // indirect
	cloud.google.com/go/compute/metadata v0.9.0 // indirect
	cloud.google.com/go/iam v1.2.2 // indirect
	cloud.google.com/go/longrunning v0.6.2 // indirect
	cloud.google.com/go/storage v1.43.0 // indirect
	dario.cat/mergo v1.0.0 // indirect
	github.com/Azure/go-ansiterm v0.0.0-20210617225240-d185dfc1b5a1 // indirect
	github.com/MicahParks/keyfunc v1.9.0 // indirect
	github.com/Microsoft/go-winio v0.6.2 // indirect
	github.com/beevik/etree v1.6.0 // indirect
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/cenkalti/backoff/v4 v4.2.1 // indirect
	github.com/cenkalti/backoff/v5 v5.0.3 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/containerd/containerd v1.7.18 // indirect
	github.com/containerd/log v0.1.0 // indirect
	github.com/containerd/platforms v0.2.1 // indirect
	github.com/cpuguy83/dockercfg v0.3.1 // indirect
	github.com/creack/pty v1.1.21 // indirect
	github.com/decred/dcrd/dcrec/secp256k1/v4 v4.4.0 // indirect
	github.com/distribution/reference v0.6.0 // indirect
	github.com/dlclark/regexp2/v2 v2.1.1 // indirect
	github.com/docker/docker v27.1.1+incompatible // indirect
	github.com/docker/go-connections v0.5.0 // indirect
	github.com/docker/go-units v0.5.0 // indirect
	github.com/felixge/httpsnoop v1.0.4 // indirect
	github.com/go-logr/logr v1.4.3 // indirect
	github.com/go-logr/stdr v1.2.2 // indirect
	github.com/go-ole/go-ole v1.2.6 // indirect
	github.com/goccy/go-json v0.10.3 // indirect
	github.com/gogo/protobuf v1.3.2 // indirect
	github.com/golang-jwt/jwt/v4 v4.5.2 // indirect
	github.com/golang/protobuf v1.5.4 // indirect
	github.com/google/s2a-go v0.1.9 // indirect
	github.com/googleapis/enterprise-certificate-proxy v0.3.4 // indirect
	github.com/googleapis/gax-go/v2 v2.14.1 // indirect
	github.com/grpc-ecosystem/grpc-gateway/v2 v2.28.0 // indirect
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/jonboulle/clockwork v0.5.0 // indirect
	github.com/klauspost/compress v1.18.0 // indirect
	github.com/lestrrat-go/blackmagic v1.0.3 // indirect
	github.com/lestrrat-go/httpcc v1.0.1 // indirect
	github.com/lestrrat-go/httprc/v3 v3.0.0-beta2 // indirect
	github.com/lestrrat-go/option v1.0.1 // indirect
	github.com/lufia/plan9stats v0.0.0-20211012122336-39d0f177ccd0 // indirect
	github.com/magiconair/properties v1.8.7 // indirect
	github.com/mattermost/xml-roundtrip-validator v0.1.0 // indirect
	github.com/moby/docker-image-spec v1.3.1 // indirect
	github.com/moby/patternmatcher v0.6.0 // indirect
	github.com/moby/sys/sequential v0.5.0 // indirect
	github.com/moby/sys/user v0.1.0 // indirect
	github.com/moby/term v0.5.0 // indirect
	github.com/morikuni/aec v1.0.0 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/opencontainers/go-digest v1.0.0 // indirect
	github.com/opencontainers/image-spec v1.1.0 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/power-devops/perfstat v0.0.0-20210106213030-5aafc221ea8c // indirect
	github.com/prometheus/client_model v0.6.2 // indirect
	github.com/prometheus/common v0.66.1 // indirect
	github.com/prometheus/procfs v0.16.1 // indirect
	github.com/russellhaering/goxmldsig v1.6.0 // indirect
	github.com/segmentio/asm v1.2.0 // indirect
	github.com/shirou/gopsutil/v3 v3.23.12 // indirect
	github.com/shoenig/go-m1cpu v0.1.6 // indirect
	github.com/sirupsen/logrus v1.9.3 // indirect
	github.com/spf13/pflag v1.0.9 // indirect
	github.com/tklauser/go-sysconf v0.3.12 // indirect
	github.com/tklauser/numcpus v0.6.1 // indirect
	github.com/yusufpapurcu/wmi v1.2.3 // indirect
	go.opentelemetry.io/auto/sdk v1.2.1 // indirect
	go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc v0.58.0 // indirect
	go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.59.0 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlptrace v1.43.0 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.21.0 // indirect
	go.opentelemetry.io/otel/metric v1.43.0 // indirect
	go.opentelemetry.io/otel/trace v1.43.0 // indirect
	go.opentelemetry.io/proto/otlp v1.10.0 // indirect
	go.yaml.in/yaml/v2 v2.4.2 // indirect
	golang.org/x/crypto v0.49.0 // indirect
	golang.org/x/net v0.52.0 // indirect
	golang.org/x/oauth2 v0.35.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.42.0 // indirect
	golang.org/x/text v0.35.0 // indirect
	google.golang.org/api v0.220.0 // indirect
	google.golang.org/appengine/v2 v2.0.2 // indirect
	google.golang.org/genproto v0.0.0-20241118233622-e639e219e697 // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20260401024825-9d38bb4040a9 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260401024825-9d38bb4040a9 // indirect
	google.golang.org/grpc v1.80.0 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)
