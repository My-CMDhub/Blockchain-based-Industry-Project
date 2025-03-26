// public/app.js                                                                                                                             
document.addEventListener('DOMContentLoaded', () => {                                                                                                         
     document.getElementById('generate-address-btn').addEventListener('click', () => {                                                                         
         fetch('/api/generate-payment-address', { method: 'POST' })                                                                                                                            
             .then(response => response.json())                                                                                                                
             .then(data => {                                                                                                                                   
                 document.getElementById('address').innerText = data.address;                                                                                  
             });                                                                                                                                               
     });                                                                                                                                                       
 });
