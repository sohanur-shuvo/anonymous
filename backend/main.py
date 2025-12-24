from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import json
import os
import hashlib
import jwt
from uuid import uuid4
import asyncio
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import firebase_admin
from firebase_admin import credentials, firestore

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="Anonymous Chat API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security & Config
security = HTTPBearer()
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "Admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Shuvo@123")
FIREBASE_CREDS = os.getenv("FIREBASE_CREDENTIALS_PATH", "firebase_credentials.json")

# Initialize Firebase
db = None
try:
    if not firebase_admin._apps:
        if os.path.exists(FIREBASE_CREDS):
            cred = credentials.Certificate(FIREBASE_CREDS)
            firebase_admin.initialize_app(cred)
            db = firestore.client()
            print("✅ Firebase initialized successfully")
        else:
            print(f"⚠️ Warning: {FIREBASE_CREDS} not found. DB operations will fail.")
    else:
        db = firestore.client()
except Exception as e:
    print(f"❌ Failed to initialize Firebase: {e}")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# Pydantic models
class GoogleLogin(BaseModel):
    credential: str

class UserSignup(BaseModel):
    name: str
    email: EmailStr
    username: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class AdminLogin(BaseModel):
    username: str
    password: str

class Message(BaseModel):
    content: str

class UserUpdate(BaseModel):
    status: str

class SettingsUpdate(BaseModel):
    auto_refresh_interval: int

# Helper functions
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return username
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# DB Helpers
def get_user(username: str) -> Optional[Dict[str, Any]]:
    if not db: return None
    try:
        doc = db.collection('users').document(username).get()
        if doc.exists:
            return doc.to_dict()
    except:
        pass
    return None

def get_user_by_email(email: str) -> Optional[tuple[str, Dict[str, Any]]]:
    if not db: return None
    try:
        users_ref = db.collection('users')
        query = users_ref.where(field_path='email', op_string='==', value=email).limit(1).stream()
        for doc in query:
            return doc.id, doc.to_dict()
    except:
        pass
    return None

def update_user(username: str, data: Dict[str, Any]):
    if not db: return
    try:
        db.collection('users').document(username).update(data)
    except:
        pass

def create_user_doc(username: str, data: Dict[str, Any]):
    if not db: return
    try:
        db.collection('users').document(username).set(data)
    except:
        pass

# Routes
@app.get("/")
async def root():
    return {"message": "Anonymous Chat API (Firebase)", "version": "2.0"}

@app.get("/api/auth/config")
async def get_auth_config():
    return {"googleClientId": GOOGLE_CLIENT_ID}

@app.post("/api/auth/google")
async def google_login(login_data: GoogleLogin):
    if not db:
        raise HTTPException(status_code=503, detail="Database not initialized")
        
    try:
        if not GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=500, detail="Google Client ID not configured")
            
        try:
            id_info = id_token.verify_oauth2_token(
                login_data.credential, 
                google_requests.Request(), 
                GOOGLE_CLIENT_ID
            )
        except Exception as e:
            print(f"Token verification failed: {str(e)}")
            raise ValueError(f"Invalid token: {str(e)}")

        email = id_info['email']
        name = id_info.get('name', email.split('@')[0])
        
        # Check by email
        result = get_user_by_email(email)
        
        if not result:
            # Create new user
            username = email.split('@')[0]
            # Handle collision
            base_username = username
            counter = 1
            while get_user(username):
                username = f"{base_username}{counter}"
                counter += 1
                
            user_data = {
                "name": name,
                "email": email,
                "password": "", 
                "auth_provider": "google",
                "status": "active",
                "created_at": datetime.now().isoformat(),
                "last_login": datetime.now().isoformat()
            }
            create_user_doc(username, user_data)
        else:
            # Update existing
            username, existing_data = result
            updates = {"last_login": datetime.now().isoformat()}
            if "auth_provider" not in existing_data:
                updates["auth_provider"] = "google"
            update_user(username, updates)
            
            if existing_data.get("status") == "banned":
                raise HTTPException(status_code=403, detail="Account has been banned")
            
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": username, "is_admin": False}, 
            expires_delta=access_token_expires
        )
        
        # Refetch fresh data
        final_user = get_user(username)
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "username": username,
                "name": final_user["name"],
                "email": final_user["email"],
                "is_admin": False
            }
        }
            
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/api/auth/signup")
async def signup(user: UserSignup):
    if not db:
        raise HTTPException(status_code=503, detail="Database not initialized")
        
    if get_user(user.username):
        raise HTTPException(status_code=400, detail="Username already exists")
    
    if get_user_by_email(user.email):
        raise HTTPException(status_code=400, detail="Email already exists")
    
    user_data = {
        "name": user.name,
        "email": user.email,
        "password": hash_password(user.password),
        "status": "active",
        "created_at": datetime.now().isoformat(),
        "last_login": datetime.now().isoformat()
    }
    
    create_user_doc(user.username, user_data)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "is_admin": False}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": user.username,
            "name": user.name,
            "email": user.email,
            "is_admin": False
        }
    }

@app.post("/api/auth/login")
async def login(user: UserLogin):
    if not db:
        raise HTTPException(status_code=503, detail="Database not initialized")
        
    result = get_user_by_email(user.email)
    
    if not result:
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    username, user_data = result
    
    if user_data.get("password") != hash_password(user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if user_data.get("status") == "banned":
        raise HTTPException(status_code=403, detail="Account has been banned")
    
    update_user(username, {"last_login": datetime.now().isoformat()})
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": username, "is_admin": False}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": username,
            "name": user_data["name"],
            "email": user_data["email"],
            "is_admin": False
        }
    }

@app.post("/api/auth/admin-login")
async def admin_login(admin: AdminLogin):
    if admin.username != ADMIN_USERNAME or admin.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": admin.username, "is_admin": True}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": admin.username,
            "name": "Administrator",
            "email": "admin@anonymous-chat.com",
            "is_admin": True
        }
    }

@app.get("/api/messages")
async def get_messages(username: str = Depends(verify_token)):
    if not db: return {"messages": []}
    
    try:
        # Get last 50 messages
        messages_ref = db.collection('messages')
        query = messages_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(50)
        
        messages = []
        docs = list(query.stream())
        for doc in reversed(docs):
            messages.append(doc.to_dict())
            
        return {"messages": messages}
    except Exception as e:
        print(f"Error fetching messages: {e}")
        return {"messages": []}

@app.post("/api/messages")
async def send_message(message: Message, username: str = Depends(verify_token)):
    if not db:
        raise HTTPException(status_code=503, detail="Database not initialized")
        
    user_data = get_user(username)
    if user_data and user_data.get("status") == "banned":
        raise HTTPException(status_code=403, detail="You are banned from sending messages")
    
    new_message = {
        "role": "user",
        "content": message.content,
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "message_id": str(uuid4()),
        "user_id": username,
        "user_name": user_data.get("name", "Anonymous") if user_data else "Administrator"
    }
    
    try:
        db.collection('messages').document(new_message['message_id']).set(new_message)
        
        # Broadcast to all connected WebSocket clients
        await manager.broadcast({
            "type": "new_message",
            "message": new_message
        })
        
        return {"success": True, "message": new_message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save message: {e}")

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
            # Echo back for heartbeat
            await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Admin routes
@app.get("/api/admin/users")
async def get_users_admin(username: str = Depends(verify_token)):
    if not db: return {"users": {}}
    
    try:
        users = {}
        docs = db.collection('users').stream()
        for doc in docs:
            users[doc.id] = doc.to_dict()
            
        return {"users": users}
    except Exception as e:
        print(f"Error fetching users: {e}")
        return {"users": {}}

@app.put("/api/admin/users/{target_username}")
async def update_user_status(target_username: str, update: UserUpdate, username: str = Depends(verify_token)):
    if not db: raise HTTPException(status_code=503, detail="DB Error")
    
    if not get_user(target_username):
        raise HTTPException(status_code=404, detail="User not found")
    
    update_user(target_username, {"status": update.status})
    updated_user = get_user(target_username)
    
    return {"success": True, "user": updated_user}

@app.delete("/api/admin/users/{target_username}")
async def delete_user(target_username: str, username: str = Depends(verify_token)):
    if not db: raise HTTPException(status_code=503, detail="DB Error")
    
    try:
        db.collection('users').document(target_username).delete()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/settings")
async def get_settings(username: str = Depends(verify_token)):
    if not db: return {"auto_refresh_interval": 2}
    
    try:
        doc = db.collection('settings').document('general').get()
        if doc.exists:
            return doc.to_dict()
    except:
        pass
    return {"auto_refresh_interval": 2}

@app.put("/api/admin/settings")
async def update_settings(settings: SettingsUpdate, username: str = Depends(verify_token)):
    if not db: raise HTTPException(status_code=503, detail="DB Error")
    
    try:
        data = {"auto_refresh_interval": settings.auto_refresh_interval}
        db.collection('settings').document('general').set(data)
        
        return {"success": True, "settings": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/admin/messages")
async def clear_messages(username: str = Depends(verify_token)):
    if not db: raise HTTPException(status_code=503, detail="DB Error")
    
    try:
        docs = db.collection('messages').limit(500).stream()
        for doc in docs:
            doc.reference.delete()
        
        await manager.broadcast({"type": "messages_cleared"})
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
async def get_stats(username: str = Depends(verify_token)):
    if not db: return {"total_users": 0, "total_messages": 0, "active_connections": 0}
    
    try:
        user_count = len(list(db.collection('users').stream()))
        msg_count = len(list(db.collection('messages').stream()))
        
        return {
            "total_users": user_count,
            "total_messages": msg_count,
            "active_connections": len(manager.active_connections)
        }
    except:
        return {"total_users": 0, "total_messages": 0, "active_connections": 0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
