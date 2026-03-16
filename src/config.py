from dotenv import load_dotenv
import os

load_dotenv('env.env')

class Config:
    api_keys = [
        os.getenv('API_KEY_1'),
        os.getenv('API_KEY_2'),
        os.getenv('API_KEY_3'),
        os.getenv('API_KEY_4'),
        os.getenv('API_KEY_5'),
        os.getenv('API_KEY_6'),
        os.getenv('API_KEY_7'),
    ]