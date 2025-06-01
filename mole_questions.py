'''
Created on Dec. 24, 2024

@author: jacegandhi
'''
import random
from queue import Queue
import tkinter as tk
import subprocess
import smtplib
'''
locations2=[
    "Circus", "Amusement Park", "Crashing Airplane", "Titanic",
    "Burning Orphanage", "Dingy Motel Drug Deal", "Prison", "Safari",
    "Zombie Apocalypse", "Organ-Harvesting Hospital", "Nuclear Submarine",
     "Daycare", "Amazon Rainforest","Jace's Basement", "Auschwitz", "Cotton Fields", 
     "Ku Klux Klan Meeting", "Sandy Hook Elementary School", "Louise Arbour", "Concert"
]
'''
locations=[
    "Circus", "Amusement Park", "Crashing Airplane", "Titanic",
    "Burning Orphanage", "Dingy Motel Drug Deal", "Prison", "Safari",
    "Zombie Apocalypse", "Organ-Harvesting Hospital", "Nuclear Submarine"
]

Jace="6474701096"
Kristien="4374242778"
Saiesh="4168314159"
Farhan="6477864398"
Ramanan="6478193215"
Kavin="6476363641"
Jarrod="fortniteman711@gmail.com"
Alpesh="4164174421"
Samir="6475700331"
Rina="6473007576"
Suhaan="2405490940"
Simmi="2404185590"
people=[Jace, Jarrod]
names=["Jace","Jarrod"]
scores={name: 0 for name in names}

def shuffle_locations(location_queue):
    random.shuffle(locations)
    while not location_queue.empty():
        location_queue.get()
    for location in locations:
        location_queue.put(location)

def load_questions(file_path, questions_queue):
    with open(file_path, 'r') as file:
        lines=file.readlines()
    stripped_lines=[line.strip() for line in lines]
    random.shuffle(stripped_lines)
    while not questions_queue.empty():
        questions_queue.get()
    for line in stripped_lines:
        questions_queue.put(line)
    
def email(emailAddress, role):
    email="gandhijace@gmail.com"
    subject="Role"
    message=role
    text=f"Subject: {subject}\n\n{message}"
    server=smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    server.login(email, "jcrbzebvichkvzjd")
    server.sendmail(email, emailAddress, text)

def mole(location_queue):
    imposter="Imposter!"
    imposter_person=random.choice(people)
    chosen_location=location_queue.get()
    location_queue.put(chosen_location)
    not_imposters=[person for person in people if person != imposter_person]
    if "@" in imposter_person:
        email(imposter_person, "imposter")
    else:
        applescript=f'tell application "Messages" to send "{imposter}" to buddy "{imposter_person}"'
        subprocess.call(['osascript', '-e', applescript])
    for person in not_imposters:
        if "@" in person:
            email(person, chosen_location)
        else:
            applescript=f'tell application "Messages" to send "{chosen_location}" to buddy "{person}"'
            subprocess.call(['osascript', '-e', applescript])
        
    if imposter_person==Jarrod:
        print("Impostor")
    else:
        print(chosen_location)

def display_question(questions_queue, question_text):
    question=questions_queue.get()
    questions_queue.put(question)
    question_text.delete("1.0", tk.END)
    question_text.insert(tk.END, question)
    question_text.tag_add("center", "1.0", "end")
    question_text.tag_configure("center", justify=tk.CENTER)
'''
def poohan(question_text):
    question_text.delete("1.0", tk.END)
    question_text.insert(tk.END, "POOHAN")
    question_text.tag_add("center", "1.0", "end")
    question_text.tag_configure("center", justify=tk.CENTER)
'''
def scoreboard(name, text_widget):
    scores[name]+=1
    text_widget.delete("1.0", tk.END)
    text_widget.insert(tk.END, f"Score: {scores[name]}")
    
def main():
    location_queue=Queue()
    questions_queue=Queue()
    shuffle_locations(location_queue)

    questions_file_path="questions.txt"
    load_questions(questions_file_path, questions_queue)

    root=tk.Tk()
    root.geometry("800x600")
    root.title("The Mole")
    card_image=tk.PhotoImage(file="question_card.png").subsample(1, 1)

    question_text=tk.Text(root, wrap=tk.WORD, width=40, height=5, font=("Helvetica", 50))
    question_text.place(relx=0.5, rely=0.2, anchor=tk.CENTER)
    
    card_button=tk.Button(root, image=card_image, command=lambda: display_question(questions_queue, question_text))
    card_button.place(relx=0.5, rely=0.6, anchor=tk.CENTER, width=300, height=475)
    
    shuffle_locations_button=tk.Button(root, text="Shuffle Locations", font=("Helvetica", 24), width=25, height=4, command=lambda: shuffle_locations(location_queue))
    shuffle_locations_button.place(relx=0.25, rely=0.9, anchor=tk.CENTER)
    
    shuffle_questions_button=tk.Button(root, text="Shuffle Questions", font=("Helvetica", 24), width=25, height=4, command=lambda: load_questions(questions_file_path, questions_queue))
    shuffle_questions_button.place(relx=0.75, rely=0.9, anchor=tk.CENTER)
    
    play_button=tk.Button(root, text="Play", font=("Helvetica", 24), width=25, height=4, command=lambda: mole(location_queue))
    play_button.place(relx=0.5, rely=0.9, anchor=tk.CENTER)
    button={}
    text={}
    i=0.035
    for person in names:
        text[person]=tk.Text(root, height=5, width=7)
        text[person].place(relx=0.6+i, rely=0.555, anchor=tk.CENTER)
        text[person].insert(tk.END, f"Score: 0")
        button[person]=tk.Button(root, text=person, height=2, width=3, command=lambda p=person: scoreboard(p, text[p]))
        button[person].place(relx=0.6+i, rely=0.5, anchor=tk.CENTER)
        i+=0.035
    
    '''
    suhaan_image=tk.PhotoImage(file="IMG_1976.png").subsample(7, 7)
    image_label=tk.Button(root, image=suhaan_image, command=lambda: poohan(question_text))
    image_label.place(relx=0.1, rely=0.5, height=300, width=200, anchor="center")
    '''
    location_heading=tk.Frame(root)
    location_heading.place(relx=0.2, rely=0.45, anchor=tk.CENTER)
    label1=tk.Label(location_heading, text="LOCATIONS", font=("Helvetica", 24), anchor="w", justify="left")
    label1.pack()

    location_frame=tk.Frame(root)
    location_frame.place(relx=0.2, rely=0.6, anchor=tk.CENTER)
    num_rows=(len(locations)+1)//2
    for i in range(num_rows):
        for j in range(2):
            idx=i+j*num_rows
            if idx<len(locations):
                label=tk.Label(location_frame, text=locations[idx], font=("Helvetica", 14), anchor="w", justify="left")
                label.grid(row=i, column=j, sticky="w", padx=20, pady=2)



    location_frame.place(relx=0.2, rely=0.6, anchor=tk.CENTER)
    location_heading.place(relx=0.2, rely=0.45, anchor=tk.CENTER)
    root.mainloop()

if __name__ =="__main__":
    main()