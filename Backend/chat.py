import chromadb
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import re
import logging 
import traceback
import uuid
from datetime import datetime
import pytesseract
from pdf2image import convert_from_path

# File processing
from PyPDF2 import PdfReader
from werkzeug.utils import secure_filename
import docx

# ML and databases
from transformers import T5Tokenizer, T5ForConditionalGeneration
from chromadb import PersistentClient

from chromadb import Client
from chromadb.config import Settings
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer
import numpy as np
from bson import ObjectId

# Initialize Flask app
app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": "http://localhost:3000",  # Your frontend URL
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "User-ID"],  # Added User-ID to allowed headers
        "supports_credentials": True
    }
})

# Configuration
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024  # 25MB limit

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add request logging for debugging
@app.before_request
def log_request_info():
    logger.info('Request: %s %s', request.method, request.path)

# Initialize ChromaDB for vector storage
client = chromadb.Client(Settings())
collection_name = "your_collection_name"

# Delete the existing collection if it exists
if collection_name in client.list_collections():
    client.delete_collection(collection_name)

# Create a new collection with the correct embedding dimension
collection = client.create_collection(
    name=collection_name,
    metadata={"embedding_dimension": 768}  # Update to match your embedding model
)

# Initialize MongoDB for history tracking
# Updated to match the server.js MongoDB connection
mongo_client = MongoClient(os.environ.get('MONGO_URI', 'mongodb://localhost:27017/'))
db = mongo_client['thinkbriefDB']  # Changed from 'researchai' to 'thinkbriefDB'
user_history_collection = db['userhistories']  # Changed to match the mongoose model collection name

def allowed_file(filename):
    ALLOWED_EXTENSIONS = {'pdf', 'docx', 'txt'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Load FLAN-T5 model with device mapping for potential GPU acceleration
def load_model():
    try:
        logger.info("Loading FLAN-T5 model...")
        tokenizer = T5Tokenizer.from_pretrained("google/flan-t5-base")
        model = T5ForConditionalGeneration.from_pretrained("google/flan-t5-base", device_map="auto")
        logger.info("Model loaded successfully")
        return tokenizer, model
    except Exception as e:
        logger.error(f"Model loading failed: {str(e)}")
        raise

tokenizer, model = load_model()

# Initialize embedding model
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

# Helper function for text cleaning
def clean_text(text):
    # Remove URLs
    text = re.sub(r'http\S+|www\S+|https\S+', '', text, flags=re.MULTILINE)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    # Limit text length to prevent issues with large documents
    return text[:100000]  # Limit to 100K characters

# Enhanced text cleaning with better formatting
def clean_and_improve_text(text, target_length=250):
    """Enhanced text cleaning with better formatting"""
    # Remove template text
    text = re.sub(r'^.?Write.?summary.*?:', '', text, flags=re.DOTALL | re.IGNORECASE)
    
    # Fix grammar
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'([.!?])\s*([a-z])', r'\1 \2', text)
    
    # Better sentence handling
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    cleaned_sentences = []
    
    for sentence in sentences:
        if sentence:
            sentence = sentence[0].upper() + sentence[1:] if len(sentence) > 1 else sentence.upper()
            cleaned_sentences.append(sentence)
    
    # Control length
    result = '. '.join(cleaned_sentences)
    words = result.split()
    if len(words) > target_length:
        result = ' '.join(words[:target_length])
        if not result.endswith(('.', '!', '?')):
            result += '.'
            
    return result

# OCR function for when regular PDF extraction fails
def ocr_pdf(file_path):
    logger.info("Attempting OCR for PDF...")
    try:
        images = convert_from_path(
            file_path,
            dpi=300,
            grayscale=True,
            thread_count=4
        )
        
        ocr_text = []
        for img in images:
            try:
                custom_config = r'--oem 3 --psm 1'
                page_text = pytesseract.image_to_string(img, config=custom_config)
                if page_text.strip():
                    ocr_text.append(page_text)
            except Exception as ocr_error:
                logger.warning(f"OCR error: {str(ocr_error)}")
                continue
                
        if ocr_text:
            return clean_text("\n".join(ocr_text))
        return None
    except Exception as e:
        logger.error(f"OCR process failed: {str(e)}")
        return None

# PDF text extraction with OCR fallback
def extract_text_from_pdf(file_path):
    try:
        text = ""
        # First attempt: PyPDF2 with strict mode disabled
        with open(file_path, 'rb') as file:
            try:
                reader = PdfReader(file, strict=False)
                for page in reader.pages:
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                    except Exception as page_error:
                        logger.warning(f"Page extraction error: {str(page_error)}")
                        continue
            except Exception as pdf_error:
                logger.error(f"PyPDF2 error: {str(pdf_error)}")
                
        # If regular extraction worked, return the text
        if text.strip():
            return clean_text(text)
            
        # Second attempt: OCR fallback
        return ocr_pdf(file_path)
            
    except Exception as e:
        logger.error(f"Complete PDF extraction failure: {str(e)}")
        logger.error(traceback.format_exc())
        return None

# DOCX text extraction
def extract_text_from_docx(file_path):
    try:
        doc = docx.Document(file_path)
        return clean_text("\n".join(para.text for para in doc.paragraphs if para.text.strip()))
    except Exception as e:
        logger.error(f"DOCX extraction error: {str(e)}")
        return None

# TXT file extraction
def extract_text_from_txt(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return clean_text(file.read(500000).strip())
    except Exception as e:
        logger.error(f"TXT extraction error: {str(e)}")
        return None

# Extract text based on file type
def extract_text(file_path, file_extension):
    if file_extension.lower() == '.pdf':
        return extract_text_from_pdf(file_path)
    elif file_extension.lower() == '.docx':
        return extract_text_from_docx(file_path)
    elif file_extension.lower() == '.txt':
        return extract_text_from_txt(file_path)
    else:
        logger.error(f"Unsupported file type: {file_extension}")
        return None

# Helper function to chunk text
def chunk_text(text, chunk_size=512, overlap=50):
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
    return chunks

# Add this new helper function at the top level with other helper functions
def post_process_summary(text):
    """Remove repetitions and improve summary quality"""
    # Split into sentences
    sentences = text.split('. ')
    # Remove duplicates while preserving order
    seen = set()
    unique_sentences = []
    for sentence in sentences:
        # Normalize sentence for comparison
        normalized = sentence.lower().strip()
        if normalized not in seen and len(normalized) > 10:
            seen.add(normalized)
            unique_sentences.append(sentence)
    
    # Rejoin with proper punctuation
    processed_text = '. '.join(unique_sentences)
    if not processed_text.endswith('.'):
        processed_text += '.'
    return processed_text

# Helper to get user ID from request
def get_user_id():
    # In a real implementation, this would extract a valid user ID from auth token
    # For now, we'll use a hardcoded ID for testing
    # You would replace this with actual authentication logic
    user_id = request.headers.get('User-ID')
    if not user_id:
        # Default test user ID if not provided
        return "64f3e2c15f7c48c39e32a9b0"  # Example ObjectId
    return user_id

# Process uploaded document - core functionality used by multiple routes
def process_uploaded_document(file):
    try:
        if file.filename == '':
            return {"error": "Empty filename"}, 400

        # Check file size
        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)

        if file_size > app.config['MAX_CONTENT_LENGTH']:
            return {"error": "File too large (max 10MB)"}, 400

        # Get file extension
        filename = secure_filename(file.filename)
        file_extension = os.path.splitext(filename)[1].lower()
        
        # Check supported file types
        if file_extension not in ['.pdf', '.docx', '.txt']:
            return {"error": "Unsupported file type. Please upload PDF, DOCX, or TXT files."}, 400

        # Save file
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

        # Extract text
        text = extract_text(file_path, file_extension)
        if not text:
            return {"error": "Failed to extract text from document"}, 500

        # Split text into chunks
        chunks = chunk_text(text, chunk_size=512, overlap=50)
        
        # Generate embeddings
        embeddings = embedding_model.encode(chunks)

        # Add embeddings to the ChromaDB collection
        doc_id = str(uuid.uuid4())
        collection.add(
            ids=[f"{doc_id}_{i}" for i in range(len(chunks))],
            documents=chunks,
            embeddings=embeddings.tolist(),
            metadatas=[{
                "doc_id": doc_id,  # Keep this as doc_id for ChromaDB queries
                "chunk_id": i,
                "source": filename
            } for i in range(len(chunks))]
        )

        # Get user ID for history
        user_id = get_user_id()

        # Save to MongoDB history with consistent field naming
        user_history_collection.insert_one({
            "userId": ObjectId(user_id),
            "documentId": doc_id,  # Use consistent documentId field
            "documentTitle": filename,
            "timestamp": datetime.utcnow(),
            "text_preview": text[:200] + "..." if len(text) > 200 else text,
            "queries": []  # Initialize empty queries array
        })

        # After processing the upload
        return {
            "message": "File uploaded and processed successfully",
            "documentId": doc_id,  # Always included
            "documentTitle": filename,
            "text_preview": text[:200] + "..." if len(text) > 200 else text
        }, 200

    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        logger.error(traceback.format_exc())
        return {"error": str(e)}, 500

@app.route('/')
def health_check():
    return jsonify({
        "status": "active",
        "model": "FLAN-T5-base",
        "endpoints": {
            "/upload": {"method": "POST", "description": "Upload a document (PDF, DOCX, TXT)"},
            "/summarize": {"method": "POST", "description": "Legacy endpoint - Upload a document"},
            "/summarize_text": {"method": "POST", "description": "Legacy endpoint - Upload a document"},
            "/generate_summary": {"method": "POST", "description": "Generate summary for uploaded document"},
            "/ask": {"method": "POST", "description": "Ask questions about a document"},
            "/history": {"method": "GET", "description": "Get document history"},
            "/document/<doc_id>": {"method": "GET", "description": "Get details of a specific document"},
            "/delete/<doc_id>": {"method": "DELETE", "description": "Delete a document"}
        }
    })

@app.route('/upload', methods=['POST'])
def upload_document():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
        
    file = request.files['file']
    result, status_code = process_uploaded_document(file)
    return jsonify(result), status_code

@app.route('/summarize', methods=['POST'])
def summarize():
    """Legacy endpoint that redirects to upload_document"""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
        
    file = request.files['file']
    result, status_code = process_uploaded_document(file)
    
    # Add compatibility with the old response format if successful
    if status_code == 200 and 'documentId' in result:
        doc_id = result['documentId']
        result["doc_id"] = result["documentId"]
        # Trigger immediate summary generation
        try:
            # Get the uploaded text
            results = collection.get(where={"doc_id": doc_id}, include=["documents"])
            if results['documents'] and len(results['documents']) > 0:  # Fixed check for array length
                # Join all document chunks to get complete context
                context = " ".join(results['documents'])  # Fix: Join all document chunks
                context = context[:5000]  # Limit to 5000 chars for processing
                
                # Generate a quick summary
                inputs = tokenizer(
                    f"Summarize this:\n{context}",
                    return_tensors="pt",
                    max_length=1024,
                    truncation=True
                )
                
                summary_ids = model.generate(
                    inputs.input_ids,
                    max_length=800,  # Longer output
                    min_length=600,  # Ensure minimum length
                    num_beams=5,     # More beams for better search
                    length_penalty=2.0,  # Encourage longer outputs
                    temperature=0.7,  # Better creativity balance
                    top_p=0.9,       # Nucleus sampling
                    do_sample=True,  # Enable sampling
                    no_repeat_ngram_size=3,  # Avoid repetition
                    repetition_penalty=1.2   # Penalize repeats
                )
                
                summary = tokenizer.decode(summary_ids[0], skip_special_tokens=True)
                
                # Add summary to result
                result["summary"] = summary
                result["context_used"] = len(context)
        except Exception as e:
            logger.error(f"Legacy summary generation error: {str(e)}")
            logger.error(traceback.format_exc())
            # Don't fail the upload if summary fails
    
    return jsonify(result), status_code

@app.route('/summarize_text', methods=['POST'])
def summarize_text():
    try:
        input_data = request.get_json()
        if not input_data or 'text' not in input_data:
            return jsonify({"error": "No input provided or missing 'text' field"}), 400
            
        text = input_data.get('text')
        if not text or not isinstance(text, str):
            return jsonify({"error": "Input must be a non-empty string"}), 400
        
        # Add a clear instruction to the input
        prompt = f"Provide a concise, non-repetitive summary of the following text:\n\n{text}"
        
        inputs = tokenizer(
            prompt,
            return_tensors="pt",
            max_length=1024,
            truncation=True
        )
        
        summary_ids = model.generate(
            inputs.input_ids,
            max_length=400,
            min_length=200,  # Set minimum length
            num_beams=5,     # Increase beam search
            length_penalty=1.5,
            temperature=0.7,
            no_repeat_ngram_size=3,
            repetition_penalty=2.5,  # Increase repetition penalty
            early_stopping=True,
            do_sample=True,   # Enable sampling
            top_p=0.92,       # Use nucleus sampling
            top_k=50          # Limit vocabulary diversity
        )
        
        # Decode and post-process the summary
        summary = tokenizer.decode(summary_ids[0], skip_special_tokens=True)
        summary = post_process_summary(summary)
        
        # Return documentId explicitly if provided in the request
        response = {"summary": summary}
        if "documentId" in input_data:
            response["documentId"] = input_data["documentId"]
        
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Summary generation error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/generate_summary', methods=['POST'])
def generate_summary():
    try:
        data = request.get_json()
        # Accept both formats for backward compatibility
        doc_id = data.get('documentId') or data.get('doc_id')

        if not doc_id:
            return jsonify({"error": "Missing document ID"}), 400

        # Retrieve document from ChromaDB
        results = collection.get(where={"doc_id": doc_id}, include=["documents", "metadatas"])
        if not results['documents'] or len(results['documents']) == 0:
            return jsonify({"error": "Document not found"}), 404

        # Combine all document chunks into a single text
        text = " ".join([item for sublist in results['documents'] for item in sublist])
        
        # Get metadata from the first chunk
        if results['metadatas'] and len(results['metadatas']) > 0 and len(results['metadatas'][0]) > 0:
            metadata = results['metadatas'][0][0]  # Get the first metadata entry
            filename = metadata.get('source', 'unknown')
        else:
            filename = "unknown"

        # Generate summary with improved prompt
        summary_prompt = (
            "Provide a detailed academic analysis of the following document in 300-400 words. "
            "Structure the summary as follows:\n"
            "1. Main objective and context\n"
            "2. Key methodologies or approaches\n"
            "3. Critical findings and evidence\n"
            "4. Significant implications and conclusions\n\n"
            "Make the summary comprehensive yet clear and well-structured:\n\n"
        )

        inputs = tokenizer(
            summary_prompt + text[:8000],  # Increased context length
            return_tensors="pt",
            max_length=1024,
            truncation=True
        )

        summary_ids = model.generate(
            inputs.input_ids,
            max_length=800,  # Longer output
            min_length=600,  # Ensure minimum length
            num_beams=5,     # More beams for better search
            length_penalty=2.0,  # Encourage longer outputs
            temperature=0.7,  # Better creativity balance
            top_p=0.9,       # Nucleus sampling
            do_sample=True,  # Enable sampling
            no_repeat_ngram_size=3,  # Avoid repetition
            repetition_penalty=1.2   # Penalize repeats
        )
        
        summary = tokenizer.decode(summary_ids[0], skip_special_tokens=True)

        # Generate advantages with improved prompt and parsing
        adv_prompt = (
            "Extract exactly 3 key advantages or strengths from this document. "
            "Format as a numbered list with each item on a new line like this:\n"
            "1. First advantage\n"
            "2. Second advantage\n"
            "3. Third advantage\n\n"
        )
        
        adv_inputs = tokenizer(
            adv_prompt + text[:3000],
            return_tensors="pt",
            max_length=1024,
            truncation=True
        )
        
        adv_ids = model.generate(
            adv_inputs.input_ids, 
            max_length=200, 
            num_beams=4, 
            no_repeat_ngram_size=2
        )
        
        advantages_text = tokenizer.decode(adv_ids[0], skip_special_tokens=True)
        
        # Improved parsing with regex to extract numbered items
        advantages = []
        adv_matches = re.findall(r'(?:\d+\.|\-|\|\•)\s([^\n\d\-\*\•]+)', advantages_text)
        for match in adv_matches:
            if match.strip():
                advantages.append(match.strip())
        
        # If regex failed to extract advantages, use the whole text
        if not advantages and advantages_text.strip():
            advantages = [advantages_text.strip()]
        
        # Generate disadvantages with similar improved prompt and parsing
        disadv_prompt = (
            "Extract exactly 3 limitations or weaknesses from this document. "
            "Format as a numbered list with each item on a new line like this:\n"
            "1. First limitation\n"
            "2. Second limitation\n"
            "3. Third limitation\n\n"
        )
        
        disadv_inputs = tokenizer(
            disadv_prompt + text[:3000],
            return_tensors="pt",
            max_length=1024,
            truncation=True
        )
        
        disadv_ids = model.generate(
            disadv_inputs.input_ids, 
            max_length=200, 
            num_beams=4, 
            no_repeat_ngram_size=2
        )
        
        disadvantages_text = tokenizer.decode(disadv_ids[0], skip_special_tokens=True)
        
        # Use the same regex pattern for disadvantages
        disadvantages = []
        disadv_matches = re.findall(r'(?:\d+\.|\-|\|\•)\s([^\n\d\-\*\•]+)', disadvantages_text)
        for match in disadv_matches:
            if match.strip():
                disadvantages.append(match.strip())
        
        # If regex failed to extract disadvantages, use the whole text
        if not disadvantages and disadvantages_text.strip():
            disadvantages = [disadvantages_text.strip()]

        # Get user ID
        user_id = get_user_id()

        # Update MongoDB history - Use consistent field name
        user_history_collection.update_one(
            {"documentId": doc_id, "userId": ObjectId(user_id)},
            {"$set": {
                "summary": summary,
                "advantages": advantages,
                "limitations": disadvantages,
                "timestamp": datetime.utcnow()
            }}
        )

        # Make sure documentId is included in response
        return jsonify({
            "summary": summary,
            "advantages": advantages,
            "limitations": disadvantages,
            "documentId": doc_id,  # Consistently use documentId in response
            "documentTitle": filename
        })

    except Exception as e:
        logger.error(f"Summary generation error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/ask', methods=['POST'])
def ask_question():
    try:
        data = request.get_json()
        question = data.get('question', '').strip()
        # Accept both formats for backward compatibility
        doc_id = data.get('documentId') or data.get('doc_id')

        if not question:
            return jsonify({"error": "Missing question"}), 400
        if not doc_id:
            return jsonify({"error": "Document ID required"}), 400

        # Generate question embedding
        question_embedding = embedding_model.encode(question)
        
        # Retrieve relevant chunks
        results = collection.query(
            query_embeddings=[question_embedding.tolist()],
            n_results=3,  # Get top 3 most relevant chunks
            where={"doc_id": doc_id}  # Filter by document
        )
        
        if not results['documents'] or len(results['documents'][0]) == 0:
            return jsonify({"error": "Document not found or no relevant content"}), 404
        
        # Combine relevant chunks into context
        context = " ".join(results['documents'][0])
        
        # Get metadata (careful handling to avoid index errors)
        if results['metadatas'] and len(results['metadatas']) > 0 and len(results['metadatas'][0]) > 0:
            metadata = results['metadatas'][0][0]  # Get the first metadata entry
            filename = metadata.get('source', 'unknown')
        else:
            filename = "unknown"

        # Generate answer using combined context
        inputs = tokenizer(
            f"Answer this question based on the context:\nQuestion: {question}\nContext: {context}",
            return_tensors="pt",
            max_length=1024,
            truncation=True
        )
        
        answer_ids = model.generate(
            inputs.input_ids, 
            max_length=300, 
            min_length=50,
            num_beams=4,
            temperature=0.7,
            no_repeat_ngram_size=3
        )
        
        answer = tokenizer.decode(answer_ids[0], skip_special_tokens=True)

        # Get user ID
        user_id = get_user_id()

        # Update MongoDB with question/answer history - Using the same doc_id format
        user_history_collection.update_one(
            {"documentId": doc_id, "userId": ObjectId(user_id)},
            {"$push": {"queries": {
                "question": question,
                "answer": answer,
                "timestamp": datetime.utcnow()
            }}}
        )

        # Always include documentId in response
        return jsonify({
            "answer": answer, 
            "context_used": len(context),
            "documentId": doc_id,  # Consistently use documentId in response
            "documentTitle": filename
        })
        
    except Exception as e:
        logger.error(f"Q&A error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/history', methods=['GET'])
def get_history():
    try:
        # Get user ID from request
        user_id = get_user_id()
        
        # Query MongoDB for user's document history
        history = list(user_history_collection.find(
            {"userId": ObjectId(user_id)},
            {
                "_id": 1,
                "documentId": 1,  # Changed from doc_id to documentId
                "documentTitle": 1,  # Changed from filename to documentTitle
                "timestamp": 1,
                "summary": 1,
                "text_preview": 1,
                "advantages": 1,
                "limitations": 1  # Changed from disadvantages to limitations
            }
        ).sort("timestamp", -1).limit(10))

        # Format data for JSON response
        formatted_history = []
        for item in history:
            formatted_item = {
                "_id": str(item["_id"]),
                "documentId": item["documentId"],
                "documentTitle": item["documentTitle"],
                "upload_date": item["timestamp"].isoformat(),
            }
            
            # Add optional fields if they exist
            if "summary" in item:
                formatted_item["summary"] = item["summary"]
            if "text_preview" in item:
                formatted_item["text_preview"] = item["text_preview"]
            if "advantages" in item:
                formatted_item["advantages"] = item["advantages"]
            if "limitations" in item:
                formatted_item["limitations"] = item["limitations"]
                
            formatted_history.append(formatted_item)

        return jsonify(formatted_history)
        
    except Exception as e:
        logger.error(f"History retrieval error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/document/<doc_id>', methods=['GET'])
def get_document_details(doc_id):
    try:
        # Get user ID
        user_id = get_user_id()
        
        # Get document history from MongoDB
        history_item = user_history_collection.find_one(
            {"documentId": doc_id, "userId": ObjectId(user_id)},
            {"_id": 0}
        )
        
        if not history_item:
            return jsonify({"error": "Document not found in history"}), 404
            
        # Get full document text from ChromaDB
        results = collection.get(where={"doc_id": doc_id}, include=["documents", "metadatas"])
        
        if not results['documents'] or len(results['documents']) == 0:
            return jsonify({"error": "Document not found in vector database"}), 404
            
        # Add full text to response by joining all chunks
        full_text = " ".join([item for sublist in results['documents'] for item in sublist])
        history_item['full_text'] = full_text
        
        # Ensure documentId is present in response
        history_item['documentId'] = doc_id
        
        # Format timestamps for JSON
        if 'timestamp' in history_item:
            history_item['upload_date'] = history_item.pop('timestamp').isoformat()
        
        # Format queries timestamps if they exist
        if 'queries' in history_item:
            for query in history_item['queries']:
                if 'timestamp' in query:
                    query['timestamp'] = query['timestamp'].isoformat()
        
        return jsonify(history_item)
        
    except Exception as e:
        logger.error(f"Document details error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/delete/<doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    try:
        # Get user ID
        user_id = get_user_id()
        
        # Find document in history
        history_item = user_history_collection.find_one({"documentId": doc_id, "userId": ObjectId(user_id)})
        if not history_item:
            return jsonify({"error": "Document not found"}), 404
            
        # Create entry in DeletedHistory collection
        # Get MongoDB connection for DeletedHistory
        deleted_history_collection = db['deletedhistories']
        
        # Create deleted history entry
        deleted_history_collection.insert_one({
            "userId": history_item["userId"],
            "documentId": history_item["documentId"],
            "documentTitle": history_item["documentTitle"],
            "originalTimestamp": history_item.get("timestamp", datetime.utcnow()),
            "deletedAt": datetime.utcnow(),
            "summary": history_item.get("summary", ""),
            "advantages": history_item.get("advantages", []),
            "limitations": history_item.get("limitations", [])
        })
        
        # Delete from user history collection
        user_history_collection.delete_one({"documentId": doc_id, "userId": ObjectId(user_id)})
        
        # Delete from ChromaDB
        collection.delete(where={"doc_id": doc_id})
        
        # Delete the physical file if it exists
        try:
            if "documentTitle" in history_item:
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], history_item["documentTitle"])
                if os.path.exists(file_path):
                    os.remove(file_path)
        except Exception as file_error:
            logger.warning(f"Error deleting physical file: {str(file_error)}")
            # Continue with deletion even if physical file removal fails
        
        return jsonify({"message": "Document deleted successfully", "documentId": doc_id})
        
    except Exception as e:
        logger.error(f"Document deletion error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/search', methods=['POST'])
def search_documents():
    try:
        data = request.get_json()
        query = data.get('query', '').strip()
        
        if not query:
            return jsonify({"error": "Search query is required"}), 400
            
        # Get user ID
        user_id = get_user_id()
        
        # Get user's document history
        user_docs = list(user_history_collection.find(
            {"userId": ObjectId(user_id)},
            {"documentId": 1, "documentTitle": 1}
        ))
        
        # Create list of document IDs
        doc_ids = [doc["documentId"] for doc in user_docs]
        
        if not doc_ids:
            return jsonify({"results": []}), 200
        
        # Generate query embedding
        query_embedding = embedding_model.encode(query)
        
        # Search across all user documents
        search_results = collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=5,
            where={"doc_id": {"$in": doc_ids}}
        )
        
        # Format results
        formatted_results = []
        if search_results['documents'] and len(search_results['documents'][0]) > 0:
            for i, (doc, metadata) in enumerate(zip(search_results['documents'][0], search_results['metadatas'][0])):
                # Find document title
                doc_id = metadata.get('doc_id')
                doc_title = next((d["documentTitle"] for d in user_docs if d["documentId"] == doc_id), "Unknown")
                
                formatted_results.append({
                    "documentId": doc_id,
                    "documentTitle": doc_title,
                    "relevance_score": search_results['distances'][0][i] if 'distances' in search_results else 0,
                    "text_snippet": doc[:200] + "..." if len(doc) > 200 else doc
                })
        
        return jsonify({"results": formatted_results})
        
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/batch_upload', methods=['POST'])
def batch_upload():
    """Handle multiple document uploads in a single request"""
    if 'files[]' not in request.files:
        return jsonify({"error": "No files provided"}), 400
        
    files = request.files.getlist('files[]')
    if not files or len(files) == 0:
        return jsonify({"error": "No files provided"}), 400
    
    results = []
    for file in files:
        result, status_code = process_uploaded_document(file)
        results.append({
            "filename": file.filename,
            "status": "success" if status_code == 200 else "error",
            "details": result
        })
    
    return jsonify({"batch_results": results}), 200

@app.route('/compare', methods=['POST'])
def compare_documents():
    """Compare two documents and analyze similarities and differences"""
    try:
        data = request.get_json()
        doc_id1 = data.get('documentId1')
        doc_id2 = data.get('documentId2')
        
        if not doc_id1 or not doc_id2:
            return jsonify({"error": "Two document IDs are required"}), 400
            
        # Get user ID
        user_id = get_user_id()
        
        # Check if both documents belong to the user
        doc1 = user_history_collection.find_one({"documentId": doc_id1, "userId": ObjectId(user_id)})
        doc2 = user_history_collection.find_one({"documentId": doc_id2, "userId": ObjectId(user_id)})
        
        if not doc1 or not doc2:
            return jsonify({"error": "One or both documents not found"}), 404
            
        # Get text from both documents
        results1 = collection.get(where={"doc_id": doc_id1}, include=["documents"])
        results2 = collection.get(where={"doc_id": doc_id2}, include=["documents"])
        
        if not results1['documents'] or not results2['documents']:
            return jsonify({"error": "Document content not found"}), 404
            
        text1 = " ".join([item for sublist in results1['documents'] for item in sublist])
        text2 = " ".join([item for sublist in results2['documents'] for item in sublist])
        
        # Limit text length for analysis
        text1 = text1[:10000]
        text2 = text2[:10000]
        
        # Generate comparison prompt
        comparison_prompt = (
            f"Compare and contrast these two documents.\n\n"
            f"Document 1 ({doc1.get('documentTitle', 'Document 1')}):\n{text1}\n\n"
            f"Document 2 ({doc2.get('documentTitle', 'Document 2')}):\n{text2}\n\n"
            f"Provide a comprehensive analysis of:\n"
            f"1. Key similarities\n"
            f"2. Major differences\n"
            f"3. Complementary insights\n"
        )
        
        inputs = tokenizer(
            comparison_prompt,
            return_tensors="pt",
            max_length=1024,
            truncation=True
        )
        
        comparison_ids = model.generate(
            inputs.input_ids,
            max_length=800,
            min_length=300,
            num_beams=4,
            temperature=0.7,
            no_repeat_ngram_size=3
        )
        
        comparison = tokenizer.decode(comparison_ids[0], skip_special_tokens=True)
        
        return jsonify({
            "comparison": comparison,
            "documentTitle1": doc1.get('documentTitle', 'Document 1'),
            "documentTitle2": doc2.get('documentTitle', 'Document 2')
        })
        
    except Exception as e:
        logger.error(f"Comparison error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

def section_text(text):
    """Extract meaningful sections for better context"""
    text_length = len(text)
    return {
        'introduction': text[:5000],  # First 5000 chars
        'middle_section': text[text_length//4:3*text_length//4],  # Middle 50%
        'conclusion_section': text[-4000:]  # Last 4000 chars
    }

SUMMARY_TEMPLATE = """Write a comprehensive research paper summary in 500-600 words.

STRUCTURE:
1. Research Context (100 words):
   - Background and problem statement
   - Research objectives and questions

2. Methodology (150 words):
   - Unique approaches and techniques
   - Data collection and analysis methods

3. Key Findings (200 words):
   - Novel discoveries and insights
   - Important results with supporting evidence

4. Implications (150 words):
   - Distinct contributions to the field
   - Practical applications

RULES:
- Do not repeat information
- Consolidate similar points
- Focus on unique contributions
- Remove redundant information

Input content to summarize:
{content}
"""

# Run the Flask application
if __name__ == '__main__':
    # For production, consider using a WSGI server like Gunicorn
    port = int(os.environ.get('PORT', 5005))
    app.run(host='0.0.0.0', port=port, debug=False)