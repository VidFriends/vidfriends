// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "VidFlow",
    defaultLocalization: "en",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "VidFlow", targets: ["VidFlow"]),
    ],
    dependencies: [
        .package(url: "https://github.com/kishikawakatsumi/KeychainAccess.git", from: "4.2.2"),
    ],
    targets: [
        .target(
            name: "VidFlow",
            dependencies: [
                .product(name: "KeychainAccess", package: "KeychainAccess"),
            ],
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "VidFlowTests",
            dependencies: ["VidFlow"]
        ),
    ]
)
