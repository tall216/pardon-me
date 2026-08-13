"""
Push the Pardon Me Play Console listing (text + graphics) directly via the
Google Play Developer (Android Publisher) API, using the service account
already granted 'Manage store presence' access.

No browser required. Uses the same credential eas submit already uses.
"""
import json
import sys
from pathlib import Path

import google.auth
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

PACKAGE_NAME = "com.davidevans.pardonme"
LANG = "en-US"
KEY_PATH = Path(__file__).parent.parent / "android" / "credentials" / "play-service-account.json"
BASE = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}"

SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]

SHORT_DESC = "Double-press volume for a realistic fake call. Your polite exit, any time."

FULL_DESC = """Some conversations don't have an exit. Pardon Me gives you one.

Double-press either volume button and your phone rings — a real-looking
incoming call, on the lock screen, with a proper ringtone. Answer it, say
"sorry, I have to take this," and walk away.

WORKS WHEN YOU NEED IT
• Double-press either volume key — up or down
• Works with the app closed, the screen off, or the phone locked
• Works while you're using another app
• Nothing on screen gives you away

LOOKS REAL
• Full-screen incoming call, exactly like the real thing
• Classic telephone ringtone, loud enough to be heard
• Rings and vibrates over the lock screen
• Answer to see a live call timer
• When you hang up, the app disappears — no interface pops up afterwards

CHOOSE WHO'S CALLING
• Quick presets: Boss, Wife, Emergency
• Or type any name you like
• The name shows on the call screen

SCHEDULE AHEAD
Know a meeting will run long? Schedule a call before you go in. It arrives on
time even if the app is closed and the phone is locked.

ALWAYS READY
Pardon Me arms itself automatically and stays armed after a restart. One tap
turns it off when you don't want it.

PRIVATE BY DESIGN
• No account, no sign-up
• No internet connection used
• No ads, no analytics, no tracking
• Nothing leaves your phone
• Does not read contacts, messages, or your call history
• Does not touch your real calls

WHY THE NOTIFICATION?
Android requires a visible notification while an app listens for volume
buttons in the background. That's the quiet "Ready" notice — it's how the
trigger keeps working when the app is closed. Disarm any time to remove it.

Pardon Me is an escape hatch, not a lie detector. Use it kindly."""

TITLE = "Pardon Me — Fake Call Escape"

STORE_DIR = Path(__file__).parent
SCREENSHOTS = [
    STORE_DIR / "screenshots" / "01_home.png",
    STORE_DIR / "screenshots" / "02_incoming_call.png",
    STORE_DIR / "screenshots" / "03_in_call.png",
    STORE_DIR / "screenshots" / "04_identity_presets.png",
]
FEATURE_GRAPHIC = STORE_DIR / "feature_graphic.png"
ICON = Path(__file__).parent.parent / "assets" / "play-icon-512.png"


def main():
    if not KEY_PATH.exists():
        print(f"FATAL: service account key not found at {KEY_PATH}")
        sys.exit(1)

    creds = service_account.Credentials.from_service_account_file(str(KEY_PATH), scopes=SCOPES)
    session = AuthorizedSession(creds)

    # 1. Create an edit (draft transaction)
    r = session.post(f"{BASE}/edits")
    r.raise_for_status()
    edit_id = r.json()["id"]
    print(f"Created edit: {edit_id}")

    # 2. Push listing text
    r = session.put(
        f"{BASE}/edits/{edit_id}/listings/{LANG}",
        json={
            "language": LANG,
            "title": TITLE,
            "shortDescription": SHORT_DESC,
            "fullDescription": FULL_DESC,
        },
    )
    if r.status_code >= 400:
        print("Listing text FAILED:", r.status_code, r.text)
    else:
        print("Listing text: OK")

    # 3. Delete any existing images in each slot first (clears "ghost" old
    #    uploads from the failed browser attempts), then upload fresh ones.
    UPLOAD_BASE = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PACKAGE_NAME}"

    def upload_images(image_type, paths):
        del_r = session.delete(f"{BASE}/edits/{edit_id}/listings/{LANG}/{image_type}")
        print(f"  cleared existing {image_type}: {del_r.status_code}")
        for p in paths:
            with open(p, "rb") as f:
                data = f.read()
            up = session.post(
                f"{UPLOAD_BASE}/edits/{edit_id}/listings/{LANG}/{image_type}",
                params={"uploadType": "media"},
                data=data,
                headers={"Content-Type": "image/png"},
            )
            if up.status_code >= 400:
                print(f"  UPLOAD FAILED [{image_type}] {p.name}: {up.status_code} {up.text}")
            else:
                print(f"  uploaded [{image_type}] {p.name}: OK")

    print("Icon:")
    upload_images("icon", [ICON])
    print("Feature graphic:")
    upload_images("featureGraphic", [FEATURE_GRAPHIC])
    print("Phone screenshots:")
    upload_images("phoneScreenshots", SCREENSHOTS)

    # 4. Validate the edit before committing
    v = session.post(f"{BASE}/edits/{edit_id}:validate")
    if v.status_code >= 400:
        print("VALIDATION FAILED:", v.status_code, v.text)
        print("NOT committing. Edit left open:", edit_id)
        sys.exit(1)
    print("Validation: OK")

    # 5. Commit
    c = session.post(f"{BASE}/edits/{edit_id}:commit")
    if c.status_code >= 400:
        print("COMMIT FAILED:", c.status_code, c.text)
        sys.exit(1)
    print("COMMITTED. Edit ID:", edit_id)
    print(json.dumps(c.json(), indent=2))


if __name__ == "__main__":
    main()
