# BlockVerify AI - Project Flow

User selects a document
        |
        v
Flask validates file type and size
        |
        v
SHA-256 fingerprint generated
        |
        +----> Preliminary checks report
        |
        v
User connects MetaMask (Sepolia)
        |
        v
DocumentRegistry.registerDocument(hash)
        |
        v
Ethereum Sepolia stores hash + wallet + timestamp
        |
        v
Later: browser recalculates hash from selected file
        |
        v
DocumentRegistry.verifyDocument(hash)
        |
        +---- match found ----> exact fingerprint was registered
        |
        +---- no match -------> exact fingerprint not registered
