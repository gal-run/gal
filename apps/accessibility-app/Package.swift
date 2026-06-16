// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "GALAccessibilityApp",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(
            name: "gal-accessibility-app",
            path: "Sources/GALComputerUse"
        ),
    ]
)
