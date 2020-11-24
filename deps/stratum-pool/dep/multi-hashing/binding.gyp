{
    "targets": [
        {
            "target_name": "multihashing",
            "sources": [
                "src/multihashing.cc",
                "src/stella.cpp"
            ],
            "include_dirs": [
                "<!(node -e \"require('nan')\")"
            ],
            "libraries": [
                "-lgmp -lgmpxx"
            ],
            "cflags_cc": [
                "-std=c++17 -fexceptions"
            ],
        }
    ]
}
