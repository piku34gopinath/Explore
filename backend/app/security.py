import os
from cryptography.fernet import Fernet
from dotenv import load_dotenv

from pathlib import Path
# Look for .env in the current directory, and then the parent of the current (root)
base_path = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=base_path / ".env")

# Get the encryption key from environment variables
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

if not ENCRYPTION_KEY:
    # Fallback to a development key if not set (not recommended for production)
    # The run_command should have added this to .env
    print("Warning: ENCRYPTION_KEY not found in environment. Using a default development key.")
    # Standard Fernet key is 32 base64-encoded bytes
    ENCRYPTION_KEY = Fernet.generate_key().decode()

cipher_suite = Fernet(ENCRYPTION_KEY.encode())

def encrypt_token(token: str) -> str:
    """Encrypts a token string."""
    if not token:
        return None
    return cipher_suite.encrypt(token.encode()).decode()

def decrypt_token(encrypted_token: str) -> str:
    """Decrypts an encrypted token string."""
    if not encrypted_token:
        return None
    try:
        return cipher_suite.decrypt(encrypted_token.encode()).decode()
    except Exception as e:
        print(f"Decryption error: {e}")
        return None
