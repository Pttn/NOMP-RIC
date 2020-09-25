{
    "targets": [
        {
            "target_name": "multihashing",
            "sources": [
                "src/multihashing.cc",
            ],
            "include_dirs": [
                "<!(node -e \"require('nan')\")"
            ],
            "cflags_cc": [
                "-std=c++17"
            ],
        }
    ]
}
