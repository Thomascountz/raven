document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
});

async function initializeApp() {
  const elements = getDomElements();
  attachEventListeners(elements);

  await checkAndDisplayKeys(elements);
  await handleEncryptedMessageFromUrl(elements);
}

function getDomElements() {
  return {
    encryptMessageButton: document.getElementById("encrypt-message"),
    encryptedUrlElement: document.getElementById("encrypted-url"),
    encryptedMessageContainer: document.getElementById("encrypted-message-info"),
    copyEncryptedMessageButton: document.getElementById("copy-encrypted-url"),
    messageInput: document.getElementById("message"),
    decryptedMessageElement: document.getElementById("decrypted-message"),
    publicKeyElement: document.getElementById("public-key-url"),
    generateKeysButton: document.getElementById("generate-keys"),
    copyPublicKeyButton: document.getElementById("copy-public-key-url"),
    feedbackElement: document.getElementById("feedback"),
  };
}

async function handleEncryptedMessageFromUrl(elements) {
  const urlParams = new URLSearchParams(window.location.search);
  const encryptedMessage = urlParams.get("encryptedMessage");

  if (encryptedMessage) {
    await decryptMessage(encryptedMessage, elements);
  }
}

function attachEventListeners(elements) {
  elements.encryptMessageButton.addEventListener("click", () =>
    encryptMessageHandler(elements),
  );
  elements.generateKeysButton.addEventListener("click", () => regenerateKeysHandler(elements));
  elements.copyPublicKeyButton.addEventListener("click", () =>
    copyToClipboard(
      elements.publicKeyElement.textContent,
      "Public key URL copied to clipboard.",
      elements.feedbackElement,
    ),
  );
  elements.copyEncryptedMessageButton.addEventListener("click", () =>
    copyToClipboard(
      elements.encryptedUrlElement.textContent,
      "Encrypted message URL copied to clipboard.",
      elements.feedbackElement,
    ),
  );
}

async function encryptMessageHandler(elements) {
  // Retrieve the public key from the URL
  const urlParams = new URLSearchParams(window.location.search);
  const publicKey = urlParams.get("publicKey");

  if (!publicKey) {
    showFeedback(elements.feedbackElement, "No public key provided in the URL.", false);
    return;
  }

  // Import the public key for encryption
  const publicKeyObject = await importPublicKey(publicKey);

  const message = elements.messageInput.value;
  try {
    // Encrypt the message
    const encodedMessage = new TextEncoder().encode(message);
    const encryptedData = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKeyObject,
      encodedMessage,
    );

    // Convert encrypted data to Base64URL and create the link
    const base64URLEncryptedData = base64URLEncode(new Uint8Array(encryptedData));
    elements.encryptedUrlElement.textContent = `${window.location.origin}${window.location.pathname}?encryptedMessage=${base64URLEncryptedData}`;
    elements.encryptedMessageContainer.style.display = "block"; // Ensure this ID matches the one in the HTML
  } catch (e) {
    showFeedback(elements.feedbackElement, "Encryption failed: " + e.message, false)
  }
}

async function regenerateKeysHandler(elements) {
  // Check if keys exist
  const privateKeyExists = localStorage.getItem("privateKey");
  const publicKeyExists = localStorage.getItem("publicKey");

  if (privateKeyExists && publicKeyExists) {
    // Confirm with the user before regenerating keys
    const userConfirmed = confirm(
      "Are you sure you want to generate new keys? This will invalidate your previous keys.",
    );

    if (userConfirmed) {
      // User confirmed, proceed to regenerate keys
      const newBase64URLPublicKey = await generateKeys();
      if (newBase64URLPublicKey) {
        updatePublicKeyURL(elements.publicKeyElement, newBase64URLPublicKey);
      }
    } else {
      // User canceled, do nothing
      return;
    }
  } else {
    // No keys were found, generate without confirmation
    const newBase64URLPublicKey = await generateKeys();
    if (newBase64URLPublicKey) {
      updatePublicKeyURL(elements.publicKeyElement, newBase64URLPublicKey);
    }
  }
}

function copyToClipboard(textToCopy, successMessage, feedbackElement) {
  navigator.clipboard.writeText(textToCopy).then(
    () => showFeedback(feedbackElement, successMessage),
    () => showFeedback(feedbackElement, "Failed to copy to clipboard.", false),
  );
}

function showFeedback(feedbackElement, message, isSuccess = true) {
  feedbackElement.textContent = message;
  feedbackElement.className = `feedback-message ${isSuccess ? "success" : "error"}`;
  feedbackElement.style.display = "block";
}

// Base64URL encoding and decoding utility functions
function base64URLEncode(arrayBuffer) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(arrayBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Utility function to decode a Base64URL string to an ArrayBuffer
function base64URLDecode(base64URL) {
  // Convert Base64URL to Base64 by replacing URL-safe characters with their Base64 equivalents
  const base64 = base64URL.replace(/-/g, "+").replace(/_/g, "/");
  // Pad the Base64 string with '=' to make it Base64 standard compliant
  const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  // Decode the Base64 string to binary and convert it to an Uint8Array
  const binaryString = atob(paddedBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generates a new key pair and persists it to localStorage
async function generateKeys() {
  try {
    // Generate an RSA key pair
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: "SHA-256" },
      },
      true,
      ["encrypt", "decrypt"],
    );

    // Export the public key and store it in localStorage
    const exportedPublicKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const base64URLPublicKey = base64URLEncode(exportedPublicKey);
    localStorage.setItem("publicKey", base64URLPublicKey);

    // Export the private key and store it in localStorage
    const exportedPrivateKey = await window.crypto.subtle.exportKey(
      "pkcs8",
      keyPair.privateKey,
    );
    const base64URLPrivateKey = base64URLEncode(exportedPrivateKey);
    localStorage.setItem("privateKey", base64URLPrivateKey);

    return base64URLPublicKey;
  } catch (e) {
    alert("Key generation failed: " + e.message);
    return null;
  }
}

// This function checks if keys exist and displays the public key URL
// If keys don't exist, it generates new keys and then displays the public key URL
async function checkAndDisplayKeys(elements) {
  let base64URLPublicKey = localStorage.getItem("publicKey");

  if (!base64URLPublicKey) {
    base64URLPublicKey = await generateKeys();
  }

  if (base64URLPublicKey) {
    updatePublicKeyURL(elements.publicKeyElement, base64URLPublicKey);
  }
}

// This function updates the public key URL on the page
function updatePublicKeyURL(publicKeyElement, publicKeyData) {
  publicKeyElement.textContent = `${window.location.origin}${window.location.pathname}?publicKey=${publicKeyData}`;
}

// Utility function to import the public key from Base64URL
async function importPublicKey(base64URLPublicKey) {
  const publicKeyData = base64URLDecode(base64URLPublicKey);
  return window.crypto.subtle.importKey(
    "spki",
    publicKeyData,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"],
  );
}

// Decryption handler (to be called when an encrypted message URL is detected)
async function decryptMessage(encryptedMessage, elements) {
  const base64URLPrivateKey = localStorage.getItem("privateKey");

  if (!base64URLPrivateKey) {
    showFeedback(elements.feedbackElement, "No private key available for decryption", false)
    return;
  }

  try {
    // Decode and import the private key from localStorage
    const privateKeyObject = await importPrivateKey(base64URLPrivateKey);

    // Decode the encrypted message from Base64URL
    const encryptedData = base64URLDecode(encryptedMessage);

    // Decrypt the message
    const decryptedData = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKeyObject,
      encryptedData,
    );

    // Convert decrypted data to a string and display it
    const dec = new TextDecoder();
    elements.decryptedMessageElement.textContent = dec.decode(decryptedData);
    document.getElementById("decrypted-message-container").style.display = "block";
  } catch (e) {
    showFeedback(elements.feedbackElement, "Decryption Failed: ", false)
  }
}

// Utility function to import the private key from Base64URL for decryption
async function importPrivateKey(base64URLPrivateKey) {
  const privateKeyData = base64URLDecode(base64URLPrivateKey);
  return window.crypto.subtle.importKey(
    "pkcs8",
    privateKeyData,
    {
      name: "RSA-OAEP",
      hash: { name: "SHA-256" },
    },
    true,
    ["decrypt"],
  );
}
