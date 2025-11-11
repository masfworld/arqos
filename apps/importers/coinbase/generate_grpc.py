#!/usr/bin/env python3
"""
Script to generate Python gRPC code from protobuf definitions.
Run this script to generate the gRPC service and message classes.
"""

import subprocess
import sys
from pathlib import Path

def generate_grpc_code():
    """Generate Python gRPC code from protobuf files."""
    
    # Get the directory containing this script
    script_dir = Path(__file__).parent
    proto_dir = script_dir / "proto"
    output_dir = script_dir / "grpc_generated"
    
    # Create output directory
    output_dir.mkdir(exist_ok=True)
    
    # Generate Python code from protobuf
    cmd = [
        sys.executable, "-m", "grpc_tools.protoc",
        f"--proto_path={proto_dir}",
        f"--python_out={output_dir}",
        f"--grpc_python_out={output_dir}",
        str(proto_dir / "importer_config.proto")
    ]
    
    print(f"Generating gRPC code from {proto_dir} to {output_dir}")
    print(f"Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print("✅ gRPC code generated successfully!")
        print(f"Generated files in: {output_dir}")
        
        # Fix imports in generated files
        fix_imports(output_dir)
        
        # List generated files
        for file in output_dir.glob("*.py"):
            print(f"  - {file.name}")
            
    except subprocess.CalledProcessError as e:
        print(f"❌ Error generating gRPC code:")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        sys.exit(1)

def fix_imports(output_dir: Path):
    """Fix absolute imports in generated files to work with the module structure."""
    grpc_file = output_dir / "importer_config_pb2_grpc.py"
    
    if grpc_file.exists():
        # Read the file
        with open(grpc_file, 'r') as f:
            content = f.read()
        
        # Replace absolute import with relative import
        content = content.replace(
            'import importer_config_pb2 as importer__config__pb2',
            'from grpc_generated import importer_config_pb2 as importer__config__pb2'
        )
        
        # Write back
        with open(grpc_file, 'w') as f:
            f.write(content)
        
        print("✅ Fixed imports in generated files")

if __name__ == "__main__":
    generate_grpc_code()
