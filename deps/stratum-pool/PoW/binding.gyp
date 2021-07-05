{
    "targets": [
        {
            "target_name": "PoW",
            "sources": [
                "PoW.cpp"
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
