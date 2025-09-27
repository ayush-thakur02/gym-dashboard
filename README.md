# Gym Dashboard

A simple, customizable dashboard for gym management and user tracking.

## Overview

Gym Dashboard is a Python-based web application designed to help manage gym users, monitor attendance, and track progress. The system is easy to set up and extend for additional features such as workout plans or trainer management.

## Features

- User registration and management
- Attendance tracking
- Configuration via TOML files
- Easy extensibility via Python modules

## File Structure

- `app.py`: Main application logic
- `user.py`: User-related operations
- `config.toml`: Configuration file
- `requirements.txt`: Python dependencies
- `.devcontainer/`: (Optional) Development container configuration

## Installation

1. **Clone the repository**
    ```
    git clone https://github.com/ayush-thakur02/Gym-Dashboard.git
    cd Gym-Dashboard
    ```

2. **Install dependencies**
    ```
    pip install -r requirements.txt
    ```

3. **Configure the application**
    - Edit `config.toml` to update any settings as needed.

## Usage

Run the main application:

```
python app.py
```

The dashboard will start and be accessible locally. For development options, refer to the `.devcontainer` directory.

## Contributing

Contributions are welcome! Please fork the repository and open a pull request for review. Bug reports and feature requests are always appreciated.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
