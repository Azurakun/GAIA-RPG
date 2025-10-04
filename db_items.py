import os
import json
import re
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI not set in environment variables!")

client = MongoClient(MONGO_URI)
db = client.gemini_rpg_db
items_collection = db.items

def populate_items_from_json(json_file_path='items.json'):
    """
    Populates the MongoDB items collection from a JSON file.
    Deletes existing items before populating to avoid duplicates.
    """
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            items_data = json.load(f)

        if items_collection.count_documents({}) > 0:
            items_collection.delete_many({})
            print("Cleared existing items from the collection.")

        result = items_collection.insert_many(items_data)
        print(f"Successfully inserted {len(result.inserted_ids)} items.")

    except FileNotFoundError:
        print(f"Error: The file {json_file_path} was not found.")
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from the file {json_file_path}.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

def find_item_by_keyword(keyword):
    """
    Finds an item in the database by searching its keywords array.
    """
    # Use a case-insensitive regex and escape special characters
    return items_collection.find_one({"keywords": {"$regex": re.escape(keyword), "$options": "i"}})

if __name__ == '__main__':
    print("Attempting to populate the database with items from items.json...")
    populate_items_from_json()
