// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "VidFriends",
    defaultLocalization: "en",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "VidFriends", targets: ["VidFriends"]),
    ],
    dependencies: [
        .package(url: "https://github.com/kishikawakatsumi/KeychainAccess.git", from: "4.2.2"),
    ],
    targets: [
        .target(
            name: "VidFriends",
            dependencies: [
                .product(name: "KeychainAccess", package: "KeychainAccess"),
            ],
            resources: [.process("Resources")]
        ),
        .target(
            name: "VidFriendsShareExtension",
            dependencies: [
                .target(name: "VidFriends"),
            ],
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "VidFriendsTests",
            dependencies: ["VidFriends"]
        ),
    ]
)
